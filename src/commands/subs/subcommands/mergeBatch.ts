import { CommandHandler } from "../../../types/command";
import { Command } from "@commander-js/extra-typings";
import { promises as fs } from "fs";
import path from "path";
import readline from "readline";
import { mergeSrtFiles } from "../../../actions/subs";

interface SubtitlePair {
    baseName: string;
    lang1Path: string;
    lang2Path: string;
    outPath: string;
}

interface BatchResult {
    pair: SubtitlePair;
    success: boolean;
    error?: string;
}

export class MergeBatchCommand implements CommandHandler {
    name = 'merge-batch';
    description = 'Batch merge two sets of subtitles by language';

    setup(program: Command): void {
        program
            .command(this.name)
            .description(this.description)
            .argument('<dir>', 'Directory containing subtitle files')
            .requiredOption('--lang1 <code>', 'First subtitle language tag (e.g. eng)')
            .requiredOption('--lang2 <code>', 'Second subtitle language tag (e.g. chi)')
            .option('--dir1 <dir>', 'Directory containing first language subtitle files (default: <dir>)')
            .option('--dir2 <dir>', 'Directory containing second language subtitle files (default: <dir>)')
            .option('--color1 <color>', 'Color of first language cues', 'white')
            .option('--color2 <color>', 'Color of second language cues', 'yellow')
            .option('--threads <n>', 'Number of concurrent merge operations', '1')
            .option('--yes', 'Skip confirmation prompt')
            .action(async (dir: string, options: {
                lang1: string;
                lang2: string;
                dir1?: string;
                dir2?: string;
                color1: string;
                color2: string;
                threads: string;
                yes?: boolean;
            }) => {
                if (options.lang1 === options.lang2) {
                    throw new Error('--lang1 and --lang2 must be different');
                }

                const threads = parseThreads(options.threads);
                const rootDir = path.resolve(dir);
                const dir1 = options.dir1 ? path.resolve(options.dir1) : rootDir;
                const dir2 = options.dir2 ? path.resolve(options.dir2) : rootDir;

                const pairs = await findSubtitlePairs(dir1, dir2, options.lang1, options.lang2);

                if (pairs.length === 0) {
                    console.log('No subtitle pairs found.');
                    console.log(`  First dir:  ${dir1}`);
                    console.log(`  Second dir: ${dir2}`);
                    console.log(`  First lang:  ${options.lang1}`);
                    console.log(`  Second lang: ${options.lang2}`);
                    return;
                }

                const confirmed = options.yes || await confirmPairs(pairs);
                if (!confirmed) {
                    console.log('Cancelled.');
                    return;
                }

                const results = await runBatch(pairs, options.color1, options.color2, threads);
                printBatchSummary(results);

                const anyFailed = results.some(r => !r.success);
                if (anyFailed) {
                    const err = new Error('One or more merges failed.');
                    (err as any).exitCode = 3;
                    throw err;
                }
            });
    }
}

async function findSubtitlePairs(dir1: string, dir2: string, lang1: string, lang2: string): Promise<SubtitlePair[]> {
    const [lang1Files, lang2Files] = await Promise.all([
        listSubtitleFiles(dir1, lang1),
        listSubtitleFiles(dir2, lang2),
    ]);

    const lang1ByBase = new Map<string, string>();
    for (const file of lang1Files) {
        const base = extractBaseName(file, lang1);
        if (!base) continue;
        if (lang1ByBase.has(base)) {
            console.warn(`⚠️ Multiple first-language files share base name "${base}"; using ${file}`);
        }
        lang1ByBase.set(base, file);
    }

    const pairs: SubtitlePair[] = [];
    for (const lang2File of lang2Files) {
        const base = extractBaseName(lang2File, lang2);
        if (!base) continue;
        const lang1Path = lang1ByBase.get(base);
        if (!lang1Path) continue;

        pairs.push({
            baseName: base,
            lang1Path,
            lang2Path: lang2File,
            outPath: path.join(path.dirname(lang2File), `${base}.${lang1}${lang2}.srt`),
        });
    }

    pairs.sort((a, b) => a.lang1Path.localeCompare(b.lang1Path));
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
        console.log(`    lang1: ${pair.lang1Path}`);
        console.log(`    lang2: ${pair.lang2Path}`);
        console.log(`    out:   ${pair.outPath}`);
    }
}

async function confirmPairs(pairs: SubtitlePair[]): Promise<boolean> {
    printPairingPlan(pairs);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
        const answer = await new Promise<string>(resolve => {
            rl.question(`\nMerge ${pairs.length} pair(s)? [y/N] `, resolve);
        });
        return answer.trim().toLowerCase() === 'y';
    } finally {
        rl.close();
    }
}

async function runBatch(pairs: SubtitlePair[], color1: string, color2: string, threads: number): Promise<BatchResult[]> {
    const results: BatchResult[] = [];

    if (threads <= 1) {
        for (let i = 0; i < pairs.length; i++) {
            results.push(await runPair(i + 1, pairs.length, pairs[i], color1, color2));
        }
        return results;
    }

    const queue = pairs.map((pair, index) => ({ index, pair }));
    const workers = Math.min(threads, queue.length);
    await Promise.all(Array.from({ length: workers }, async () => {
        while (true) {
            const item = queue.shift();
            if (!item) break;
            const result = await runPair(item.index + 1, pairs.length, item.pair, color1, color2);
            results[item.index] = result;
        }
    }));

    return results;
}

async function runPair(index: number, total: number, pair: SubtitlePair, color1: string, color2: string): Promise<BatchResult> {
    console.log(`\n[${index}/${total}] ${pair.baseName}`);

    try {
        await mergeSrtFiles({
            subtitle1: { path: pair.lang1Path, color: color1 },
            subtitle2: { path: pair.lang2Path, color: color2 },
            outputPath: pair.outPath,
        });
        return { pair, success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`❌ Failed: ${message}`);
        return { pair, success: false, error: message };
    }
}

function printBatchSummary(results: BatchResult[]): void {
    const succeeded = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log('\n=== Batch Merge Summary ===');
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
