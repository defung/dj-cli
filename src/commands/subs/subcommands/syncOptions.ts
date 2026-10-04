import {Command, Option} from "commander";

export interface SyncCLIOptions {
    mode: string;
    confidence?: string;
    splitPenalty?: string;
    dryRun?: boolean;
    strict?: boolean;
    snap?: true | string;
    encoding?: string;
    backup?: boolean;
}

export interface ParsedSyncOptions {
    mode: 'auto' | 'nosplit' | 'ols' | 'split';
    confidence?: number;
    splitPenalty?: number;
    dryRun: boolean;
    strict: boolean;
    snap?: true | number;
    encoding?: string;
    noBackup: boolean;
}

export function addSyncOptions(command: Command): Command {
    return command
        .option('--mode <mode>', 'Timing model: auto, nosplit, ols, split', 'auto')
        .option('--confidence <N>', 'Confidence threshold')
        .option('--split-penalty <N>', 'Split penalty (used with --mode split)')
        .option('--dry-run', 'Work out the answer but write nothing')
        .option('--strict', 'Refuse instead of writing an unsure result')
        .option('--snap [ms]', 'Pull cue starts onto nearby picture cuts')
        .option('--encoding <name>', 'Output encoding')
        .option('--no-backup', 'Do not create .bak file');
}

export function parseMode(mode: string): 'auto' | 'nosplit' | 'ols' | 'split' {
    if (mode !== 'auto' && mode !== 'nosplit' && mode !== 'ols' && mode !== 'split') {
        throw new Error('--mode must be one of: auto, nosplit, ols, split');
    }
    return mode;
}

export function parseSyncOptions(options: SyncCLIOptions): ParsedSyncOptions {
    const mode = parseMode(options.mode);

    const parsed: ParsedSyncOptions = {
        mode,
        dryRun: options.dryRun ?? false,
        strict: options.strict ?? false,
        noBackup: options.backup === false,
    };

    if (options.confidence !== undefined) {
        const confidence = parseFloat(options.confidence);
        if (isNaN(confidence) || confidence < 0) {
            throw new Error('--confidence must be non-negative');
        }
        parsed.confidence = confidence;
    }

    if (options.splitPenalty !== undefined) {
        const splitPenalty = parseFloat(options.splitPenalty);
        if (isNaN(splitPenalty) || splitPenalty < 0) {
            throw new Error('--split-penalty must be non-negative');
        }
        parsed.splitPenalty = splitPenalty;
    }

    if (options.snap !== undefined) {
        if (options.snap === true) {
            parsed.snap = true;
        } else {
            const snap = parseInt(options.snap, 10);
            if (isNaN(snap) || snap < 0) {
                throw new Error('--snap must be a non-negative integer');
            }
            parsed.snap = snap;
        }
    }

    if (options.encoding !== undefined) {
        parsed.encoding = options.encoding;
    }

    return parsed;
}

export function buildSyncArgs(
    refPath: string,
    targetPath: string,
    outPath: string,
    options: ParsedSyncOptions,
): string[] {
    const args: string[] = [refPath, targetPath];

    if (options.mode === 'split') {
        args.push('split');
        if (options.splitPenalty !== undefined) {
            args.push(String(options.splitPenalty));
        }
    } else if (options.mode !== 'auto') {
        args.push(options.mode);
    }

    args.push('--output', outPath);

    if (options.noBackup) args.push('--no-backup');
    if (options.dryRun) args.push('--dry-run');
    if (options.strict) args.push('--strict');
    if (options.confidence !== undefined) args.push('--confidence', String(options.confidence));
    if (options.snap !== undefined) {
        args.push('--snap');
        if (options.snap !== true) {
            args.push(String(options.snap));
        }
    }
    if (options.encoding !== undefined) args.push('--encoding', options.encoding);

    return args;
}
