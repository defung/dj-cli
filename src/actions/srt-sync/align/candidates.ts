import { Cue } from '../types';
import { cosineSimilarity } from '../embed/vector';

export interface Anchor {
    targetIdx: number;
    refIdx: number;
    targetMs: number;
    refMs: number;
    sim: number;
    margin: number;
}

export function findAnchorCandidates(
    targetCues: Cue[],
    refCues: Cue[],
    targetVectors: Float32Array[],
    refVectors: Float32Array[],
    minSimilarity = 0.5
): Anchor[] {
    const targetTop1: Array<{ idx: number; sim: number; secondSim: number }> = [];

    for (let t = 0; t < targetCues.length; t++) {
        let bestR = -1;
        let bestSim = -Infinity;
        let secondSim = -Infinity;

        for (let r = 0; r < refCues.length; r++) {
            const sim = cosineSimilarity(targetVectors[t], refVectors[r]);
            if (sim > bestSim) {
                secondSim = bestSim;
                bestSim = sim;
                bestR = r;
            } else if (sim > secondSim) {
                secondSim = sim;
            }
        }

        targetTop1[t] = { idx: bestR, sim: bestSim, secondSim };
    }

    const anchors: Anchor[] = [];

    for (let t = 0; t < targetCues.length; t++) {
        const top = targetTop1[t];
        if (top.idx < 0 || top.sim < minSimilarity) continue;

        // Mutual nearest neighbor: target t's best ref is r, and r's best target is t
        let rBestT = -1;
        let rBestSim = -Infinity;
        const r = top.idx;
        for (let tt = 0; tt < targetCues.length; tt++) {
            const sim = cosineSimilarity(targetVectors[tt], refVectors[r]);
            if (sim > rBestSim) {
                rBestSim = sim;
                rBestT = tt;
            }
        }

        if (rBestT !== t) continue;

        anchors.push({
            targetIdx: t,
            refIdx: r,
            targetMs: targetCues[t].startMs,
            refMs: refCues[r].startMs,
            sim: top.sim,
            margin: top.sim - top.secondSim,
        });
    }

    return anchors;
}
