import { Group } from '../types';

export function computeConfidence(
    sim: number,
    margin: number,
    timeResidualMs: number,
    timeToleranceMs: number
): number {
    const marginScore = Math.max(0, Math.min(1, margin * 5));
    const timeScore = Math.max(0, Math.min(1, 1 - timeResidualMs / (2 * timeToleranceMs)));

    // For 1:1 matches with a very good time alignment, don't let similarity alone drag confidence down.
    if (timeScore > 0.7 && marginScore > 0.25) {
        return Math.max(0, Math.min(1, 0.6 * sim + 0.25 * timeScore + 0.15 * marginScore));
    }

    const raw = 0.5 * sim + 0.2 * marginScore + 0.3 * timeScore;
    return Math.max(0, Math.min(1, raw));
}

export function computeGroupConfidence(
    group: Group,
    margin: number,
    timeToleranceMs: number
): number {
    return computeConfidence(
        group.sim,
        margin,
        group.timeResidualMs,
        timeToleranceMs
    );
}
