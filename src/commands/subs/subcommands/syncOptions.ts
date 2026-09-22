import {Command, Option} from "commander";

export interface SyncCLIOptions {
    mode: string;
    embedModel: string;
    embedInstruction?: string;
    ollamaUrl: string;
    maxGroup: string;
    minConfidence: string;
    timeToleranceMs: string;
    skipPenalty: string;
    refEncoding?: string;
    targetEncoding?: string;
    report?: string;
    strict?: boolean;
    clampOverlap?: boolean;
    dryRun?: boolean;
    verbose?: boolean;
}

export interface ParsedSyncOptions {
    mode: 'auto' | 'offset' | 'drift';
    embedModel: string;
    embedInstruction?: string;
    ollamaUrl: string;
    maxGroup: number;
    minConfidence: number;
    timeToleranceMs: number;
    skipPenalty: number;
    refEncoding?: string;
    targetEncoding?: string;
    reportPath: string | null;
    strict: boolean;
    clampOverlap: boolean;
    dryRun: boolean;
    verbose: boolean;
}

export function addSyncOptions(command: Command): Command {
    return command
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
        .option('-v, --verbose', 'Print per-stage details');
}

export function parseMode(mode: string): 'auto' | 'offset' | 'drift' {
    if (mode !== 'auto' && mode !== 'offset' && mode !== 'drift') {
        throw new Error('--mode must be one of: auto, offset, drift');
    }
    return mode;
}

export function parseSyncOptions(options: SyncCLIOptions): ParsedSyncOptions {
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

    const reportPath =
        options.report === 'none' || options.report === undefined
            ? null
            : options.report;

    return {
        mode,
        embedModel: options.embedModel,
        embedInstruction: options.embedInstruction,
        ollamaUrl: options.ollamaUrl,
        maxGroup,
        minConfidence,
        timeToleranceMs,
        skipPenalty,
        refEncoding: options.refEncoding,
        targetEncoding: options.targetEncoding,
        reportPath,
        strict: options.strict ?? false,
        clampOverlap: options.clampOverlap ?? false,
        dryRun: options.dryRun ?? false,
        verbose: options.verbose ?? false,
    };
}
