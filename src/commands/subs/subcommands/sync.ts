import { CommandHandler } from "../../../types/command";
import { Command } from "@commander-js/extra-typings";
import { runSync, SyncOptions, SyncProgress } from "../../../actions/srt-sync";
import path from "path";
import { addSyncOptions, parseSyncOptions, SyncCLIOptions } from "./syncOptions";

export class SyncCommand implements CommandHandler {
    name = 'sync';
    description = 'Retime a target subtitle to match a reference subtitle using semantic alignment';

    setup(program: Command): void {
        const cmd = program
            .command(this.name)
            .description(this.description)
            .argument('<ref>', 'Reference subtitle file (correct timing)')
            .argument('<target>', 'Target subtitle file (correct text, wrong timing)')
            .argument('[out]', 'Output file path')
            .option('--ref-lang <code>', 'Optional reference language hint (BCP-47)')
            .option('--target-lang <code>', 'Optional target language hint (BCP-47)');

        addSyncOptions(cmd as unknown as import('commander').Command)
            .action(async (ref, target, out, options: SyncCLIOptions & { refLang?: string; targetLang?: string }) => {
                const parsed = parseSyncOptions(options);
                const outPath = out ?? `${target}.synced.srt`;

                if (outPath === ref || outPath === target) {
                    throw new Error('Output path cannot be the same as reference or target input.');
                }

                const syncOptions: SyncOptions = {
                    refPath: path.resolve(ref),
                    targetPath: path.resolve(target),
                    outPath: path.resolve(outPath),
                    reportPath: parsed.reportPath ? path.resolve(parsed.reportPath) : null,
                    refLang: options.refLang,
                    targetLang: options.targetLang,
                    mode: parsed.mode,
                    embedModel: parsed.embedModel,
                    embedInstruction: parsed.embedInstruction,
                    ollamaUrl: parsed.ollamaUrl,
                    maxGroup: parsed.maxGroup,
                    minConfidence: parsed.minConfidence,
                    timeToleranceMs: parsed.timeToleranceMs,
                    skipPenalty: parsed.skipPenalty,
                    creditPatterns: [],
                    strict: parsed.strict,
                    clampOverlap: parsed.clampOverlap,
                    dryRun: parsed.dryRun,
                    refEncoding: parsed.refEncoding,
                    targetEncoding: parsed.targetEncoding,
                    verbose: parsed.verbose,
                    onProgress: renderProgress,
                };

                try {
                    await runSync(syncOptions);
                } finally {
                    finalizeProgress();
                }
            });
    }
}

const STAGE_WEIGHTS: Record<string, number> = {
    parse: 0.05,
    embed: 0.50,
    fit: 0.05,
    align: 0.20,
    assign: 0.10,
    write: 0.10,
};

let lastProgressLine = '';

function renderProgress(p: SyncProgress): void {
    const stageWeight = STAGE_WEIGHTS[p.stage] ?? 0;
    const stagePct = p.total > 0 ? p.current / p.total : 0;

    const stageKeys = Object.keys(STAGE_WEIGHTS);
    const stageIndex = stageKeys.indexOf(p.stage);
    const completedBefore = stageKeys
        .slice(0, Math.max(0, stageIndex))
        .reduce((sum, key) => sum + STAGE_WEIGHTS[key], 0);

    const overall = Math.round((completedBefore + stageWeight * stagePct) * 100);

    const line = `[${overall.toString().padStart(3, ' ')}%] ${p.stage}: ${p.message ?? ''}`;

    if (line === lastProgressLine) return;

    if (process.stdout.isTTY) {
        const cols = process.stdout.columns ?? 80;
        const visible = line.slice(0, cols);
        process.stdout.write('\r' + ' '.repeat(cols) + '\r' + visible);
    } else {
        console.log(line);
    }
    lastProgressLine = line;
}

export function finalizeProgress(): void {
    if (lastProgressLine && process.stdout.isTTY) {
        process.stdout.write('\n');
    }
    lastProgressLine = '';
}
