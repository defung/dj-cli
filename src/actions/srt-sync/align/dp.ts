import { Cue, Group, TimeModel } from '../types';
import { cosineSimilarity, weightedMeanVector } from '../embed/vector';

interface DPState {
    score: number;
    prevI: number;
    prevJ: number;
    stepP: number;
    stepQ: number;
}

export interface DPOptions {
    maxGroup: number;
    skipPenalty: number;
    timeToleranceMs: number;
    shapePenalty: number;
    bandSeconds: number;
    minConfidence: number;
    timeModel: TimeModel;
}

function cueWeight(cue: Cue): number {
    return Array.from(cue.text).length || 1;
}

function groupVector(cues: Cue[], vectors: Float32Array[], indices: number[]): Float32Array {
    const selected = indices.map(i => vectors[i]);
    const weights = indices.map(i => cueWeight(cues[i]));
    return weightedMeanVector(selected, weights);
}

function groupTime(cues: Cue[], indices: number[]): { startMs: number; endMs: number } {
    const starts = indices.map(i => cues[i].startMs);
    const ends = indices.map(i => cues[i].endMs);
    return {
        startMs: Math.min(...starts),
        endMs: Math.max(...ends),
    };
}

function matchScore(
    targetCues: Cue[],
    refCues: Cue[],
    targetVectors: Float32Array[],
    refVectors: Float32Array[],
    targetIdx: number[],
    refIdx: number[],
    model: TimeModel,
    timeToleranceMs: number,
    shapePenalty: number
): { sim: number; timeResidualMs: number } {
    const tv = groupVector(targetCues, targetVectors, targetIdx);
    const rv = groupVector(refCues, refVectors, refIdx);
    const sim = cosineSimilarity(tv, rv);

    const tt = groupTime(targetCues, targetIdx);
    const rt = groupTime(refCues, refIdx);

    const predictedStart = model.a * tt.startMs + model.b;
    const predictedEnd = model.a * tt.endMs + model.b;
    const residualStart = Math.abs(predictedStart - rt.startMs);
    const residualEnd = Math.abs(predictedEnd - rt.endMs);
    const timeResidualMs = (residualStart + residualEnd) / 2;

    // We don't subtract penalties here; caller combines them
    return { sim, timeResidualMs };
}

export function align(
    targetCues: Cue[],
    refCues: Cue[],
    targetVectors: Float32Array[],
    refVectors: Float32Array[],
    options: DPOptions
): Group[] {
    const n = targetCues.length;
    const m = refCues.length;
    const {
        maxGroup,
        skipPenalty,
        timeToleranceMs,
        shapePenalty,
        bandSeconds,
        timeModel,
    } = options;

    const bandMs = bandSeconds * 1000;
    const lambda = 1.0; // time penalty weight

    // DP table as nested maps (sparse due to banding)
    const dp = new Map<string, DPState>();

    function key(i: number, j: number): string {
        return `${i},${j}`;
    }

    function setState(i: number, j: number, state: DPState): void {
        dp.set(key(i, j), state);
    }

    function getState(i: number, j: number): DPState | undefined {
        return dp.get(key(i, j));
    }

    function matchInBand(targetIdx: number[], refIdx: number[]): boolean {
        const tt = groupTime(targetCues, targetIdx);
        const rt = groupTime(refCues, refIdx);
        const predictedRefStart = timeModel.a * tt.startMs + timeModel.b;
        return Math.abs(predictedRefStart - rt.startMs) <= bandMs;
    }

    setState(0, 0, { score: 0, prevI: -1, prevJ: -1, stepP: 0, stepQ: 0 });

    for (let i = 0; i <= n; i++) {
        for (let j = 0; j <= m; j++) {
            const current = getState(i, j);
            if (!current) continue;

            // (1,0) skip target cue
            if (i < n) {
                const next = getState(i + 1, j);
                const candidateScore = current.score - skipPenalty;
                if (!next || candidateScore > next.score) {
                    setState(i + 1, j, {
                        score: candidateScore,
                        prevI: i,
                        prevJ: j,
                        stepP: 1,
                        stepQ: 0,
                    });
                }
            }

            // (0,1) skip reference cue
            if (j < m) {
                const candidateScore = current.score - skipPenalty * 0.2;
                const next = getState(i, j + 1);
                if (!next || candidateScore > next.score) {
                    setState(i, j + 1, {
                        score: candidateScore,
                        prevI: i,
                        prevJ: j,
                        stepP: 0,
                        stepQ: 1,
                    });
                }
            }

            // (p,q) matches — banded to keep the search near the fitted model
            for (let p = 1; p <= maxGroup && i + p <= n; p++) {
                for (let q = 1; q <= maxGroup && j + q <= m; q++) {
                    const targetIdx = Array.from({ length: p }, (_, k) => i + k);
                    const refIdx = Array.from({ length: q }, (_, k) => j + k);

                    if (!matchInBand(targetIdx, refIdx)) continue;

                    const { sim, timeResidualMs } = matchScore(
                        targetCues,
                        refCues,
                        targetVectors,
                        refVectors,
                        targetIdx,
                        refIdx,
                        timeModel,
                        timeToleranceMs,
                        shapePenalty
                    );

                    const timePenalty = lambda * Math.min(
                        Math.pow(timeResidualMs / timeToleranceMs, 2),
                        4
                    );
                    const shapeCost = (p > 1 || q > 1 ? 1 : 0) * shapePenalty * (p + q - 2);

                    const candidateScore = current.score + sim - timePenalty - shapeCost;
                    const next = getState(i + p, j + q);
                    if (!next || candidateScore > next.score) {
                        setState(i + p, j + q, {
                            score: candidateScore,
                            prevI: i,
                            prevJ: j,
                            stepP: p,
                            stepQ: q,
                        });
                    }
                }
            }
        }
    }

    // Backtrack
    const groups: Group[] = [];
    let i = n;
    let j = m;
    while (i > 0 || j > 0) {
        const state = getState(i, j);
        if (!state) break;

        if (state.stepP === 1 && state.stepQ === 0) {
            // target-only extra
            groups.push({
                target: [i - 1],
                ref: [],
                sim: 0,
                timeResidualMs: 0,
                confidence: 0,
                status: 'matched',
                reason: 'target-extra',
            });
            i -= 1;
        } else if (state.stepP === 0 && state.stepQ === 1) {
            // reference-only extra: emit nothing
            j -= 1;
        } else if (state.stepP > 0 && state.stepQ > 0) {
            const targetIdx = Array.from({ length: state.stepP }, (_, k) => i - state.stepP + k);
            const refIdx = Array.from({ length: state.stepQ }, (_, k) => j - state.stepQ + k);
            const { sim, timeResidualMs } = matchScore(
                targetCues,
                refCues,
                targetVectors,
                refVectors,
                targetIdx,
                refIdx,
                timeModel,
                timeToleranceMs,
                shapePenalty
            );
            groups.push({
                target: targetIdx,
                ref: refIdx,
                sim,
                timeResidualMs,
                confidence: 0, // filled later
                status: 'matched',
            });
            i -= state.stepP;
            j -= state.stepQ;
        } else {
            break;
        }
    }

    groups.reverse();
    return groups;
}
