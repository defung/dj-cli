import { Cue, Group, TimeModel } from '../types';
import { align, DPOptions } from './dp';
import { computeGroupConfidence } from './confidence';
import { fitTimeModel } from '../timing/fit';
import { cosineSimilarity } from '../embed/vector';

function computeMargins(
    targetCues: Cue[],
    refCues: Cue[],
    targetVectors: Float32Array[],
    refVectors: Float32Array[],
    groups: Group[],
    model: TimeModel,
    bandSeconds: number
): number[] {
    const bandMs = bandSeconds * 1000;
    const margins: number[] = [];

    for (const group of groups) {
        if (group.ref.length === 0) {
            margins.push(0);
            continue;
        }

        const matchedRefIdx = new Set(group.ref);
        let bestAlt = -Infinity;

        for (const t of group.target) {
            const predictedRefMs = model.a * targetCues[t].startMs + model.b;
            for (let r = 0; r < refCues.length; r++) {
                if (matchedRefIdx.has(r)) continue;
                if (Math.abs(refCues[r].startMs - predictedRefMs) > bandMs) continue;
                const sim = cosineSimilarity(targetVectors[t], refVectors[r]);
                if (sim > bestAlt) {
                    bestAlt = sim;
                }
            }
        }

        const margin = bestAlt > -Infinity ? group.sim - bestAlt : 0.3;
        margins.push(margin);
    }

    return margins;
}

export function refineAlignment(
    targetCues: Cue[],
    refCues: Cue[],
    targetVectors: Float32Array[],
    refVectors: Float32Array[],
    initialModel: TimeModel,
    options: Pick<
        DPOptions,
        | 'maxGroup'
        | 'skipPenalty'
        | 'timeToleranceMs'
        | 'shapePenalty'
        | 'minConfidence'
    > & { bandSeconds: number; mode: 'auto' | 'offset' | 'drift' }
): { groups: Group[]; model: TimeModel } {
    const dpOptions: DPOptions = {
        ...options,
        timeModel: initialModel,
        bandSeconds: options.bandSeconds,
    };

    let groups = align(targetCues, refCues, targetVectors, refVectors, dpOptions);

    // Initial confidence pass (margins unknown, use generous default)
    for (const group of groups) {
        group.confidence = computeGroupConfidence(group, 0.3, options.timeToleranceMs);
    }

    // Refit model from high-confidence 1:1 groups
    const anchorPoints = groups
        .filter(
            g =>
                g.target.length === 1 &&
                g.ref.length === 1 &&
                g.confidence >= 0.6
        )
        .map(g => ({
            targetMs: targetCues[g.target[0]].startMs,
            refMs: refCues[g.ref[0]].startMs,
        }));

    let refinedModel = initialModel;
    if (anchorPoints.length >= 8) {
        try {
            refinedModel = fitTimeModel(anchorPoints, options.mode);
        } catch {
            refinedModel = initialModel;
        }
    }

    // Rerun DP with tighter band
    dpOptions.timeModel = refinedModel;
    dpOptions.bandSeconds = Math.max(10, options.bandSeconds / 2);
    groups = align(targetCues, refCues, targetVectors, refVectors, dpOptions);

    // Compute real margins and final confidence
    const margins = computeMargins(targetCues, refCues, targetVectors, refVectors, groups, refinedModel, dpOptions.bandSeconds);
    for (let i = 0; i < groups.length; i++) {
        groups[i].confidence = computeGroupConfidence(groups[i], margins[i], options.timeToleranceMs);
    }

    // Demote low-confidence matches to unmatched target extras
    for (const group of groups) {
        if (group.target.length > 0 && group.ref.length > 0 && group.confidence < options.minConfidence) {
            group.status = 'demoted';
            group.reason = `confidence ${group.confidence.toFixed(3)} below threshold ${options.minConfidence}`;
        }
    }

    return { groups, model: refinedModel };
}
