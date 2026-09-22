import { CommandHandler } from "../../../types/command";
import { Command } from "@commander-js/extra-typings";
import { promises as fs } from "fs";
import path from "path";
import readline from "readline";
import { runSync, SyncOptions, SyncReport, SyncProgress } from "../../../actions/srt-sync";
import { addSyncOptions, ParsedSyncOptions, parseSyncOptions, SyncCLIOptions } from "./syncOptions";

interface SubtitlePair {
    baseName: string;
    refPath: string;
    targetPath: string;
    outPath: string;
}

interface BatchResult {
    pair: SubtitlePair;
    success: boolean;
    error?: string;
    report?: SyncReport;
}

export class SyncBatchCommand implements CommandHandler {
    name = 'sync-batch';
    description = 'Batch retime target subtitles to match reference subtitles in a directory';

    setup(program: Command): void {
        const cmd = program
            .command(this.name)
            .description(this.description)
            .argument('<dir>', 'Directory containing subtitle files')
            .requiredOption('--ref-lang <code>', 'Reference subtitle language tag (e.g. eng)')
            .requiredOption('--target-lang <code>', 'Target subtitle language tag (e.g. chi)')
            .option('--ref-dir <dir>', 'Directory containing reference subtitle files (default: <dir>)')
            .option('--target-dir <dir>', 'Directory containing target subtitle files (default: <dir>)')
            .option('--threads <n>', 'Number of concurrent sync operations', '1')
            .option('--yes', 'Skip confirmation prompt');

        addSyncOptions(cmd as unknown as import('commander').Command)
            .action(async (dir: string, options: SyncCLIOptions & { refLang: string; targetLang: string; refDir?: string; targetDir?: string; threads: string; yes?: boolean }) => {
                if (options.refLang === options.targetLang) {
                    throw new Error('--ref-lang and --target-lang must be different');
                }

                const parsedSyncOptions = parseSyncOptions(options);
                const threads = parseThreads(options.threads);
                const rootDir = path.resolve(dir);
                const refDir = options.refDir ? path.resolve(options.refDir) : rootDir;
                const targetDir = options.targetDir ? path.resolve(options.targetDir) : rootDir;

                const pairs = await findSubtitlePairs(refDir, targetDir, options.refLang, options.targetLang);

                if (pairs.length === 0) {
                    console.log('No subtitle pairs found.');
                    console.log(`  Reference dir:  ${refDir}`);
                    console.log(`  Target dir:     ${targetDir}`);
                    console.log(`  Reference lang: ${options.refLang}`);
                    console.log(`  Target lang:    ${options.targetLang}`);
                    return;
                }

                if (options.dryRun) {
                    printPairingPlan(pairs);
                    return;
                }

                const confirmed = options.yes || await confirmPairs(pairs);
                if (!confirmed) {
                    console.log('Cancelled.');
                    return;
                }

                const results = await runBatch(pairs, parsedSyncOptions, threads);
                printBatchSummary(results);

                const anyFailed = results.some(r => !r.success);
                if (anyFailed) {
                    const err = new Error('One or more pairs failed to sync.');
                    (err as any).exitCode = 3;
                    throw err;
                }
            });
    }
}

async function findSubtitlePairs(refDir: string, targetDir: string, refLang: string, targetLang: string): Promise<SubtitlePair[]> {
    const [refFiles, targetFiles] = await Promise.all([
        listSubtitleFiles(refDir, refLang),
        listSubtitleFiles(targetDir, targetLang),
    ]);

    const refByBase = new Map<string, string>();
    for (const file of refFiles) {
        const base = extractBaseName(file, refLang);
        if (!base) continue;
        if (refByBase.has(base)) {
            console.warn(`⚠️ Multiple reference files share base name "${base}"; using ${file}`);
        }
        refByBase.set(base, file);
    }

    const pairs: SubtitlePair[] = [];
    for (const targetFile of targetFiles) {
        const base = extractBaseName(targetFile, targetLang);
        if (!base) continue;
        const refPath = refByBase.get(base);
        if (!refPath) continue;

        pairs.push({
            baseName: base,
            refPath,
            targetPath: targetFile,
            outPath: `${targetFile.slice(0, -'.srt'.length)}-synced.srt`,
        });
    }

    pairs.sort((a, b) => a.refPath.localeCompare(b.refPath));
    return pairs;
}

async function listSubtitleFiles(dir: string, lang: string): Promise<string[]> {
    const suffix = `.${lang}.srt`;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
        .filter(e => e.isFile() && e.name.toLowerCase().endsWith(suffix.toLowerCase()))
        .map(e => path.join(dir, e.name));
}

function extractBaseName(filePath: string, lang: string): string | null {
    const fileName = path.basename(filePath);
    const suffix = `.${lang}.srt`;
    if (!fileName.toLowerCase().endsWith(suffix.toLowerCase())) return null;
    return fileName.slice(0, -suffix.length);
}

function printPairingPlan(pairs: SubtitlePair[]): void {
    console.log(`\nDiscovered ${pairs.length} pair(s):`);
    for (const pair of pairs) {
        console.log(`  ${pair.baseName}`);
        console.log(`    ref:    ${pair.refPath}`);
        console.log(`    target: ${pair.targetPath}`);
        console.log(`    out:    ${pair.outPath}`);
    }
}

async function confirmPairs(pairs: SubtitlePair[]): Promise<boolean> {
    printPairingPlan(pairs);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
        const answer = await new Promise<string>(resolve => {
            rl.question(`\nSync ${pairs.length} pair(s)? [y/N] `, resolve);
        });
        return answer.trim().toLowerCase() === 'y';
    } finally {
        rl.close();
    }
}

async function runBatch(pairs: SubtitlePair[], options: ParsedSyncOptions, threads: number): Promise<BatchResult[]> {
    const results: BatchResult[] = [];

    if (threads <= 1) {
        for (let i = 0; i < pairs.length; i++) {
            results.push(await runPair(i + 1, pairs.length, pairs[i], options));
        }
        return results;
    }

    const queue = pairs.map((pair, index) => ({ index, pair }));
    const workers = Math.min(threads, queue.length);
    await Promise.all(Array.from({ length: workers }, async (_, workerIndex) => {
        while (true) {
            const item = queue.shift();
            if (!item) break;
            const result = await runPair(item.index + 1, pairs.length, item.pair, options);
            results[item.index] = result;
        }
    }));

    return results;
}

async function runPair(index: number, total: number, pair: SubtitlePair, options: ParsedSyncOptions): Promise<BatchResult> {
    console.log(`\n[${index}/${total}] ${pair.baseName}`);

    const syncOptions: SyncOptions = {
        refPath: pair.refPath,
        targetPath: pair.targetPath,
        outPath: pair.outPath,
        reportPath: null,
        refLang: undefined,
        targetLang: undefined,
        mode: options.mode,
        embedModel: options.embedModel,
        embedInstruction: options.embedInstruction,
        ollamaUrl: options.ollamaUrl,
        maxGroup: options.maxGroup,
        minConfidence: options.minConfidence,
        timeToleranceMs: options.timeToleranceMs,
        skipPenalty: options.skipPenalty,
        creditPatterns: [],
        strict: options.strict,
        clampOverlap: options.clampOverlap,
        dryRun: options.dryRun,
        refEncoding: options.refEncoding,
        targetEncoding: options.targetEncoding,
        verbose: options.verbose,
        onProgress: renderProgress,
    };

    try {
        const { report } = await runSync(syncOptions);
        return { pair, success: true, report };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`❌ Failed: ${message}`);
        return { pair, success: false, error: message };
    } finally {
        finalizeProgress();
    }
}

function printBatchSummary(results: BatchResult[]): void {
    const succeeded = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log('\n=== Batch Sync Summary ===');
    console.log(`Total pairs:  ${results.length}`);
    console.log(`Succeeded:    ${succeeded.length}`);
    console.log(`Failed:       ${failed.length}`);

    if (failed.length > 0) {
        console.log('\nFailures:');
        for (const r of failed) {
            console.log(`  - ${r.pair.baseName}: ${r.error}`);
        }
    }
}

function parseThreads(value: string): number {
    const n = parseInt(value, 10);
    if (isNaN(n) || n < 1) {
        throw new Error('--threads must be a positive integer');
    }
    return n;
}

function renderProgress(_p: SyncProgress): void {
    // Batch mode prints a header per pair; avoid TTY churn from per-stage updates.
}

function finalizeProgress(): void {
    // no-op for batch mode
}
