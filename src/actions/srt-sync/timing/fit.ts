import { TimeModel } from '../types';

interface Point {
    targetMs: number;
    refMs: number;
}

const COMMON_RATIOS = [
    { name: '24/25', value: 24 / 25 },
    { name: '25/24', value: 25 / 24 },
    { name: '23.976/25', value: 23.976 / 25 },
    { name: '25/23.976', value: 25 / 23.976 },
    { name: '30/29.97', value: 30 / 29.97 },
    { name: '29.97/30', value: 29.97 / 30 },
];

function median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
}

function mad(values: number[]): number {
    if (values.length === 0) return 0;
    const m = median(values);
    return median(values.map(v => Math.abs(v - m))) || 1;
}

function leastSquares(points: Point[]): { a: number; b: number; residual: number } {
    const n = points.length;
    if (n === 0) return { a: 1, b: 0, residual: 0 };
    if (n === 1) {
        const a = 1;
        const b = points[0].refMs - points[0].targetMs;
        return { a, b, residual: 0 };
    }

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;
    for (const p of points) {
        sumX += p.targetMs;
        sumY += p.refMs;
        sumXY += p.targetMs * p.refMs;
        sumXX += p.targetMs * p.targetMs;
    }

    const denom = n * sumXX - sumX * sumX;
    if (Math.abs(denom) < 1e-9) {
        // All target times are the same; fall back to offset
        return { a: 1, b: median(points.map(p => p.refMs - p.targetMs)), residual: 0 };
    }

    const a = (n * sumXY - sumX * sumY) / denom;
    const b = (sumY - a * sumX) / n;

    let residual = 0;
    for (const p of points) {
        const predicted = a * p.targetMs + b;
        residual += Math.abs(p.refMs - predicted);
    }
    residual /= n;

    return { a, b, residual };
}

function fitOffset(points: Point[]): TimeModel {
    const offsets = points.map(p => p.refMs - p.targetMs);

    // Histogram with 500ms bins to find peak
    const binSize = 500;
    const bins = new Map<number, number>();
    for (const off of offsets) {
        const bin = Math.floor(off / binSize) * binSize;
        bins.set(bin, (bins.get(bin) ?? 0) + 1);
    }

    let peakBin = 0;
    let peakCount = 0;
    for (const [bin, count] of bins.entries()) {
        if (count > peakCount) {
            peakCount = count;
            peakBin = bin;
        }
    }

    // Refine with median of inliers within one bin width
    const inlierOffsets = offsets.filter(
        o => o >= peakBin - binSize / 2 && o <= peakBin + binSize / 2
    );
    const offset = median(inlierOffsets.length > 0 ? inlierOffsets : offsets);

    const inliers = points.filter(p => Math.abs(p.refMs - p.targetMs - offset) <= 1000);
    const refinedOffset = median(inliers.map(p => p.refMs - p.targetMs)) || offset;

    const residual =
        inliers.length > 0
            ? inliers.reduce((s, p) => s + Math.abs(p.refMs - p.targetMs - refinedOffset), 0) /
              inliers.length
            : 0;

    return {
        a: 1,
        b: refinedOffset,
        inliers: inliers.length,
        total: points.length,
        mode: 'offset',
        residualMs: residual,
    };
}

function ransacDrift(
    points: Point[],
    iterations: number,
    inlierThresholdMs: number,
    aMin = 0.9,
    aMax = 1.1
): { a: number; b: number; inliers: Point[]; residual: number } | null {
    if (points.length < 2) return null;

    let best: { a: number; b: number; inliers: Point[]; residual: number } | null = null;

    for (let i = 0; i < iterations; i++) {
        const i1 = Math.floor(Math.random() * points.length);
        let i2 = Math.floor(Math.random() * points.length);
        if (i1 === i2) {
            i2 = (i2 + 1) % points.length;
        }
        const p1 = points[i1];
        const p2 = points[i2];

        const dt = p2.targetMs - p1.targetMs;
        if (Math.abs(dt) < 1) continue;

        let a = (p2.refMs - p1.refMs) / dt;
        if (a < aMin || a > aMax) continue;

        const b = p1.refMs - a * p1.targetMs;

        const inliers: Point[] = [];
        for (const p of points) {
            const predicted = a * p.targetMs + b;
            if (Math.abs(p.refMs - predicted) <= inlierThresholdMs) {
                inliers.push(p);
            }
        }

        if (inliers.length < 2) continue;

        const ls = leastSquares(inliers);
        if (ls.a < aMin || ls.a > aMax) continue;

        const residual =
            inliers.reduce((s, p) => s + Math.abs(p.refMs - (ls.a * p.targetMs + ls.b)), 0) /
            inliers.length;

        if (
            !best ||
            inliers.length > best.inliers.length ||
            (inliers.length === best.inliers.length && residual < best.residual)
        ) {
            best = { a: ls.a, b: ls.b, inliers, residual };
        }
    }

    return best;
}

function snapFramerate(a: number): number {
    for (const ratio of COMMON_RATIOS) {
        if (Math.abs(a - ratio.value) / Math.max(1e-9, Math.abs(ratio.value)) < 0.001) {
            return ratio.value;
        }
    }
    return a;
}

function fitDrift(points: Point[]): TimeModel | null {
    const result = ransacDrift(points, Math.min(500, points.length * 50), 1000);
    if (!result || result.inliers.length < 2) return null;

    let a = snapFramerate(result.a);
    // Recompute b for snapped a
    const b = median(result.inliers.map(p => p.refMs - a * p.targetMs));

    const residual =
        result.inliers.reduce((s, p) => s + Math.abs(p.refMs - (a * p.targetMs + b)), 0) /
        result.inliers.length;

    return {
        a,
        b,
        inliers: result.inliers.length,
        total: points.length,
        mode: 'drift',
        residualMs: residual,
    };
}

export function fitTimeModel(
    points: Point[],
    mode: 'auto' | 'offset' | 'drift',
    minInliers = 8,
    minRatio = 0.05
): TimeModel {
    if (points.length < minInliers) {
        throw new Error(
            `Too few anchor points (${points.length}) to fit a timing model. Need at least ${minInliers}.`
        );
    }

    const offsetModel = fitOffset(points);
    const driftModel = mode === 'offset' ? null : fitDrift(points);

    let chosen: TimeModel;
    if (mode === 'offset') {
        chosen = offsetModel;
    } else if (mode === 'drift') {
        if (!driftModel) {
            throw new Error('Could not fit a drift model to the anchor points.');
        }
        chosen = driftModel;
    } else {
        // auto
        if (
            driftModel &&
            driftModel.inliers >= minInliers &&
            driftModel.inliers >= offsetModel.inliers * 0.8 &&
            Math.abs(driftModel.a - 1) > 0.0005 &&
            driftModel.residualMs < offsetModel.residualMs * 0.9
        ) {
            chosen = driftModel;
        } else {
            chosen = offsetModel;
        }
    }

    const ratio = chosen.inliers / points.length;
    if (chosen.inliers < minInliers && ratio < minRatio) {
        throw new Error(
            `Could not fit a reliable timing model: only ${chosen.inliers}/${points.length} inliers.`
        );
    }

    if (ratio < 0.15) {
        // Non-fatal warning will be printed by caller
    }

    return chosen;
}
