import { CommandHandler } from "../../../types/command";
import { Command, Option } from "@commander-js/extra-typings";
import { runSync, SyncOptions, SyncProgress } from "../../../actions/srt-sync";
import path from "path";

export class SyncCommand implements CommandHandler {
    name = 'sync';
    description = 'Retime a target subtitle to match a reference subtitle using semantic alignment';

    setup(program: Command): void {
        program
            .command(this.name)
            .description(this.description)
            .argument('<ref>', 'Reference subtitle file (correct timing)')
            .argument('<target>', 'Target subtitle file (correct text, wrong timing)')
            .argument('[out]', 'Output file path')
            .option('--ref-lang <code>', 'Optional reference language hint (BCP-47)')
            .option('--target-lang <code>', 'Optional target language hint (BCP-47)')
            .option('--mode <mode>', 'Timing model: auto, offset, drift', 'auto')
            .option('--embed-model <name>', 'Ollama embedding model', 'qwen3-embedding:4b')
            .option('--embed-instruction <text>', 'Optional embedding task instruction')
            .addOption(
                new Option('--ollama-url <url>', 'Ollama base URL')
                    .env('OLLAMA_URL')
                    .default('http://localhost:11434')
            )
            .option('--max-group <n>', 'Max cues per side in one alignment group', '4')
            .option('--min-confidence <0-1>', 'Minimum match confidence', '0.45')
            .option('--time-tolerance-ms <n>', 'Scale for time-residual penalty', '1500')
            .option('--skip-penalty <x>', 'Cost of leaving a cue unmatched', '0.5')
            .option('--ref-encoding <enc>', 'Reference file encoding override')
            .option('--target-encoding <enc>', 'Target file encoding override')
            .option('--report <file|none>', 'Write a JSON review report (default: none, unless specified)')
            .option('--strict', 'Exit non-zero if unresolved fraction is too high')
            .option('--clamp-overlap', 'Trim overlapping cue ends')
            .option('--dry-run', 'Run alignment but do not write output SRT')
            .option('-v, --verbose', 'Print per-stage details')
            .action(async (ref, target, out, options) => {
                const mode = parseMode(options.mode);
                const maxGroup = parseInt(options.maxGroup, 10);
                const minConfidence = parseFloat(options.minConfidence);
                const timeToleranceMs = parseInt(options.timeToleranceMs, 10);
                const skipPenalty = parseFloat(options.skipPenalty);

                if (isNaN(maxGroup) || maxGroup < 1 || maxGroup > 8) {
                    throw new Error('--max-group must be an integer between 1 and 8');
                }
                if (isNaN(minConfidence) || minConfidence < 0 || minConfidence > 1) {
                    throw new Error('--min-confidence must be between 0 and 1');
                }
                if (isNaN(timeToleranceMs) || timeToleranceMs < 1) {
                    throw new Error('--time-tolerance-ms must be a positive integer');
                }
                if (isNaN(skipPenalty) || skipPenalty < 0) {
                    throw new Error('--skip-penalty must be non-negative');
                }

                const outPath = out ?? `${target}.synced.srt`;

                if (outPath === ref || outPath === target) {
                    throw new Error('Output path cannot be the same as reference or target input.');
                }

                const reportPath =
                    options.report === 'none' || options.report === undefined
                        ? null
                        : options.report;

                const syncOptions: SyncOptions = {
                    refPath: path.resolve(ref),
                    targetPath: path.resolve(target),
                    outPath: path.resolve(outPath),
                    reportPath: reportPath ? path.resolve(reportPath) : null,
                    refLang: options.refLang,
                    targetLang: options.targetLang,
                    mode,
                    embedModel: options.embedModel,
                    embedInstruction: options.embedInstruction,
                    ollamaUrl: options.ollamaUrl,
                    maxGroup,
                    minConfidence,
                    timeToleranceMs,
                    skipPenalty,
                    creditPatterns: [],
                    strict: options.strict ?? false,
                    clampOverlap: options.clampOverlap ?? false,
                    dryRun: options.dryRun ?? false,
                    refEncoding: options.refEncoding,
                    targetEncoding: options.targetEncoding,
                    verbose: options.verbose ?? false,
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

function collect(value: string, previous: string[]): string[] {
    return previous.concat(value);
}

function parseMode(mode: string): 'auto' | 'offset' | 'drift' {
    if (mode !== 'auto' && mode !== 'offset' && mode !== 'drift') {
        throw new Error('--mode must be one of: auto, offset, drift');
    }
    return mode;
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
