import { promises as fs } from 'fs';
import path from 'path';
import { Cue, Group, ProgressCallback, SyncOptions, SyncProgress, SyncReport, TimeModel } from './types';
import { EmbeddingProvider } from './types';
import { readSubtitleFile, parseSubtitles, serializeSubtitles, sha1Text } from './parse';
import { OllamaEmbeddingProvider } from './embed/ollama';
import { FakeEmbeddingProvider } from './embed/fake';
import { cosineSimilarity, weightedMeanVector } from './embed/vector';
import { fitTimeModel } from './timing/fit';
import { findAnchorCandidates } from './align/candidates';
import { refineAlignment } from './align/refine';
import { assignTimings } from './retime/assign';
import { printSummary, strictThresholdExceeded, writeReport } from './report';

export { EmbeddingProvider, Cue, Group, ProgressCallback, SyncOptions, SyncReport, SyncProgress, TimeModel };
export { FakeEmbeddingProvider };

export function createOllamaProvider(options: {
    url: string;
    model: string;
    instruction?: string;
    cacheDir?: string;
}): EmbeddingProvider {
    return new OllamaEmbeddingProvider(options);
}

export function createFakeProvider(dim = 64, noise = 0.0): FakeEmbeddingProvider {
    return new FakeEmbeddingProvider(dim, noise);
}

export async function runSync(options: SyncOptions): Promise<{
    outputContent: string;
    report: SyncReport;
}> {
    const progress = options.onProgress ?? (() => {});

    progress({ stage: 'parse', current: 0, total: 3, message: 'Reading subtitle files...' });

    // 1. Read & parse
    const refFile = await readSubtitleFile(options.refPath, options.refEncoding);
    const targetFile = await readSubtitleFile(options.targetPath, options.targetEncoding);

    let refCues = parseSubtitles(refFile.content);
    let targetCues = parseSubtitles(targetFile.content);

    if (refCues.length === 0) {
        throw new Error(`No cues found in reference file: ${options.refPath}`);
    }
    if (targetCues.length === 0) {
        throw new Error(`No cues found in target file: ${options.targetPath}`);
    }

    progress({ stage: 'parse', current: 1, total: 2, message: `Parsed ${targetCues.length} target and ${refCues.length} reference cues` });

    // 3. Embed
    progress({ stage: 'embed', current: 0, total: 2, message: 'Connecting to Ollama...' });

    const provider = new OllamaEmbeddingProvider({
        url: options.ollamaUrl,
        model: options.embedModel,
        instruction: options.embedInstruction,
    });

    try {
        await provider.ensureModel();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Embedding setup failed: ${message}`);
    }

    progress({ stage: 'embed', current: 1, total: 2, message: `Embedding ${targetCues.length} target cues...` });

    let targetVectors: Float32Array[];
    let refVectors: Float32Array[];
    try {
        targetVectors = await provider.embed(targetCues.map(c => c.text));
        progress({ stage: 'embed', current: 1, total: 2, message: `Embedding ${refCues.length} reference cues...` });
        refVectors = await provider.embed(refCues.map(c => c.text));
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Embedding failed: ${message}`);
    }

    progress({ stage: 'embed', current: 2, total: 2, message: 'Embedding complete' });

    // 4. Initial anchor candidates and timing fit
    progress({ stage: 'fit', current: 0, total: 2, message: 'Finding anchor candidates...' });

    const anchors = findAnchorCandidates(targetCues, refCues, targetVectors, refVectors, 0.4);
    const anchorPoints = anchors.map(a => ({
        targetMs: a.targetMs,
        refMs: a.refMs,
    }));

    progress({ stage: 'fit', current: 1, total: 2, message: `Fitting timing model from ${anchors.length} anchors...` });

    const initialModel = fitTimeModel(anchorPoints, options.mode);

    progress({
        stage: 'fit',
        current: 2,
        total: 2,
        message: `Model: ${initialModel.mode}, a=${initialModel.a.toFixed(6)}, offset=${(initialModel.b / 1000).toFixed(3)}s`,
    });

    // 5. Align with refinement
    progress({ stage: 'align', current: 0, total: 2, message: 'Aligning cues...' });

    const { groups, model } = refineAlignment(targetCues, refCues, targetVectors, refVectors, initialModel, {
        maxGroup: options.maxGroup,
        skipPenalty: options.skipPenalty,
        timeToleranceMs: options.timeToleranceMs,
        shapePenalty: 0.01,
        bandSeconds: 45,
        minConfidence: options.minConfidence,
        mode: options.mode,
    });

    progress({ stage: 'align', current: 1, total: 2, message: `Alignment produced ${groups.length} groups` });

    // 6. Assign timings
    progress({ stage: 'assign', current: 0, total: 2, message: 'Assigning output timings...' });

    const { cues: outCues, report } = assignTimings(targetCues, refCues, groups, model, options.clampOverlap);

    progress({ stage: 'assign', current: 1, total: 2, message: `Assigned ${outCues.length} output cues` });

    // 7. Serialize
    const outputContent = serializeSubtitles(outCues, targetFile.lineEnding);

    progress({ stage: 'write', current: 0, total: 1, message: options.dryRun ? 'Dry run; not writing output file' : `Writing ${options.outPath}...` });

    if (!options.dryRun) {
        const outDir = path.dirname(options.outPath);
        await fs.mkdir(outDir, { recursive: true });
        await fs.writeFile(options.outPath, outputContent, 'utf8');
    }

    progress({ stage: 'write', current: 1, total: 1, message: 'Done' });

    await writeReport(report, options.reportPath);

    printSummary(report);

    if (options.strict && strictThresholdExceeded(report)) {
        const err = new Error('Strict mode: too many unresolved blocks.');
        (err as any).exitCode = 4;
        throw err;
    }

    return { outputContent, report };
}
