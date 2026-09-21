export interface Cue {
    idx: number;
    startMs: number;
    endMs: number;
    raw: string;
    text: string;
}

export interface TimeModel {
    a: number;
    b: number;
    inliers: number;
    total: number;
    mode: 'offset' | 'drift';
    residualMs: number;
}

export interface Group {
    target: number[];
    ref: number[];
    sim: number;
    timeResidualMs: number;
    confidence: number;
    status: 'matched' | 'demoted';
    reason?: string;
}

export interface SyncProgress {
    stage: string;
    current: number;
    total: number;
    message?: string;
}

export type ProgressCallback = (progress: SyncProgress) => void;

export interface SyncOptions {
    refPath: string;
    targetPath: string;
    outPath: string;
    reportPath: string | null;
    refLang?: string;
    targetLang?: string;
    mode: 'auto' | 'offset' | 'drift';
    embedModel: string;
    embedInstruction?: string;
    ollamaUrl: string;
    maxGroup: number;
    minConfidence: number;
    timeToleranceMs: number;
    skipPenalty: number;
    creditPatterns: string[];
    strict: boolean;
    clampOverlap: boolean;
    dryRun: boolean;
    refEncoding?: string;
    targetEncoding?: string;
    verbose: boolean;
    onProgress?: ProgressCallback;
}

export interface SyncReport {
    model: TimeModel;
    counts: {
        '1:1': number;
        '1:N': number;
        'M:1': number;
        'M:N': number;
        unmatchedInterpolated: number;
        unmatchedExtrapolated: number;
        dropped: number;
        demoted: number;
        overlaps: number;
    };
    groups: ReportGroup[];
    lowConfidence: ReportGroup[];
    dropped: Array<{ idx: number; startMs: number; endMs: number; text: string; reason: string }>;
    overlaps: Array<{ idx1: number; idx2: number; startMs: number; endMs: number }>;
}

export interface ReportGroup {
    type: '1:1' | '1:N' | 'M:1' | 'M:N' | 'unmatched';
    targetIdx: number[];
    refIdx: number[];
    confidence: number;
    sim: number;
    timeResidualMs: number;
    oldStartMs: number;
    oldEndMs: number;
    newStartMs: number;
    newEndMs: number;
    text: string;
    reason?: string;
}

export interface EmbeddingProvider {
    embed(texts: string[]): Promise<Float32Array[]>;
    name(): string;
}
