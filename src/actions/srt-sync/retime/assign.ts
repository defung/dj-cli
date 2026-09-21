import { Cue, Group, TimeModel, SyncReport, ReportGroup } from '../types';

const MIN_DURATION_MS = 200;

interface AnchorPoint {
    targetMs: number;
    outMs: number;
}

function groupType(group: Group): ReportGroup['type'] {
    if (group.ref.length === 0 || group.status === 'demoted') return 'unmatched';
    if (group.target.length === 1 && group.ref.length === 1) return '1:1';
    if (group.target.length === 1 && group.ref.length > 1) return '1:N';
    if (group.target.length > 1 && group.ref.length === 1) return 'M:1';
    return 'M:N';
}

function buildAnchorPoints(groups: Group[], targetCues: Cue[], refCues: Cue[]): AnchorPoint[] {
    const points: AnchorPoint[] = [];

    for (const group of groups) {
        const type = groupType(group);
        if (type === 'unmatched') continue;

        const targetStart = targetCues[group.target[0]].startMs;
        const targetEnd = targetCues[group.target[group.target.length - 1]].endMs;

        let outStart: number;
        let outEnd: number;

        if (type === '1:1') {
            outStart = refCues[group.ref[0]].startMs;
            outEnd = refCues[group.ref[0]].endMs;
        } else if (type === '1:N') {
            outStart = refCues[group.ref[0]].startMs;
            outEnd = refCues[group.ref[group.ref.length - 1]].endMs;
        } else {
            // M:1 or M:N: shift by first-start delta
            outStart = refCues[group.ref[0]].startMs;
            outEnd = outStart + (targetEnd - targetStart);
        }

        points.push({ targetMs: targetStart, outMs: outStart });
        points.push({ targetMs: targetEnd, outMs: outEnd });
    }

    // Sort by targetMs and enforce monotonicity on outMs
    points.sort((a, b) => a.targetMs - b.targetMs);
    const monotone: AnchorPoint[] = [];
    let maxOut = -Infinity;
    for (const p of points) {
        if (p.outMs >= maxOut) {
            monotone.push(p);
            maxOut = p.outMs;
        }
    }

    return monotone;
}

function interpolate(
    t: number,
    anchors: AnchorPoint[],
    model: TimeModel
): number {
    if (anchors.length === 0) {
        return model.a * t + model.b;
    }

    if (t <= anchors[0].targetMs) {
        const a0 = anchors[0];
        return a0.outMs + model.a * (t - a0.targetMs);
    }

    if (t >= anchors[anchors.length - 1].targetMs) {
        const aN = anchors[anchors.length - 1];
        return aN.outMs + model.a * (t - aN.targetMs);
    }

    for (let i = 0; i < anchors.length - 1; i++) {
        const c1 = anchors[i];
        const c2 = anchors[i + 1];
        if (t >= c1.targetMs && t <= c2.targetMs) {
            const ratio = (t - c1.targetMs) / (c2.targetMs - c1.targetMs);
            return c1.outMs + ratio * (c2.outMs - c1.outMs);
        }
    }

    return model.a * t + model.b;
}

function clampDuration(startMs: number, endMs: number, originalDurationMs: number): { startMs: number; endMs: number } {
    if (endMs - startMs < MIN_DURATION_MS) {
        endMs = startMs + Math.max(MIN_DURATION_MS, originalDurationMs);
    }
    return { startMs, endMs };
}

function applyNegativeTimeRule(startMs: number, endMs: number): { startMs: number; endMs: number; dropped: boolean } {
    if (endMs <= 0) {
        return { startMs: 0, endMs: 0, dropped: true };
    }
    if (startMs < 0) {
        const duration = endMs - startMs;
        return { startMs: 0, endMs: duration, dropped: false };
    }
    return { startMs, endMs, dropped: false };
}

export function assignTimings(
    targetCues: Cue[],
    refCues: Cue[],
    groups: Group[],
    model: TimeModel,
    clampOverlap = false
): { cues: Cue[]; report: SyncReport } {
    const anchors = buildAnchorPoints(groups, targetCues, refCues);
    const reportGroups: ReportGroup[] = [];
    const dropped: SyncReport['dropped'] = [];
    const outCues: Cue[] = [];

    let count1to1 = 0;
    let count1toN = 0;
    let countMto1 = 0;
    let countMtoN = 0;
    let countInterpolated = 0;
    let countExtrapolated = 0;
    let countDropped = 0;
    let countDemoted = 0;

    for (const group of groups) {
        const type = groupType(group);
        const targetStart = targetCues[group.target[0]].startMs;
        const targetEnd = targetCues[group.target[group.target.length - 1]].endMs;

        let outStart: number;
        let outEnd: number;
        let reason: string | undefined;

        if (type === '1:1') {
            outStart = refCues[group.ref[0]].startMs;
            outEnd = refCues[group.ref[0]].endMs;
            count1to1++;
        } else if (type === '1:N') {
            outStart = refCues[group.ref[0]].startMs;
            outEnd = refCues[group.ref[group.ref.length - 1]].endMs;
            count1toN++;
        } else if (type === 'M:1' || type === 'M:N') {
            const delta = refCues[group.ref[0]].startMs - targetStart;
            outStart = targetStart + delta;
            outEnd = targetEnd + delta;
            if (type === 'M:1') countMto1++;
            else countMtoN++;
            if (type === 'M:N') {
                reason = 'M:N boundary using M:1 rule';
            }
        } else {
            // unmatched
            const beforeFirst = anchors.length === 0 || targetEnd < anchors[0].targetMs;
            const afterLast = anchors.length > 0 && targetStart > anchors[anchors.length - 1].targetMs;

            outStart = interpolate(targetStart, anchors, model);
            outEnd = interpolate(targetEnd, anchors, model);

            if (beforeFirst || afterLast) {
                countExtrapolated++;
                reason = beforeFirst ? 'extrapolated before first anchor' : 'extrapolated after last anchor';
            } else {
                countInterpolated++;
                reason = 'interpolated between anchors';
            }

            if (group.status === 'demoted') {
                countDemoted++;
                reason = group.reason ?? reason;
            }
        }

        const clamped = clampDuration(outStart, outEnd, targetEnd - targetStart);
        outStart = clamped.startMs;
        outEnd = clamped.endMs;

        if (group.target.length === 1) {
            const neg = applyNegativeTimeRule(outStart, outEnd);
            if (neg.dropped) {
                countDropped++;
                dropped.push({
                    idx: targetCues[group.target[0]].idx,
                    startMs: targetCues[group.target[0]].startMs,
                    endMs: targetCues[group.target[0]].endMs,
                    text: targetCues[group.target[0]].text,
                    reason: reason ?? 'negative time',
                });
                continue;
            }
            outStart = neg.startMs;
            outEnd = neg.endMs;
        }

        // For M:1 / M:N, preserve each cue's duration and gaps
        if (group.target.length > 1) {
            const delta = outStart - targetStart;
            for (let k = 0; k < group.target.length; k++) {
                const t = targetCues[group.target[k]];
                let s = t.startMs + delta;
                let e = t.endMs + delta;
                const neg = applyNegativeTimeRule(s, e);
                if (neg.dropped) {
                    countDropped++;
                    dropped.push({
                        idx: t.idx,
                        startMs: t.startMs,
                        endMs: t.endMs,
                        text: t.text,
                        reason: 'negative time in shifted group',
                    });
                    continue;
                }
                s = neg.startMs;
                e = neg.endMs;
                const c = clampDuration(s, e, t.endMs - t.startMs);
                outCues.push({ ...t, startMs: c.startMs, endMs: c.endMs });
            }
        } else {
            const t = targetCues[group.target[0]];
            outCues.push({ ...t, startMs: outStart, endMs: outEnd });
        }

        reportGroups.push({
            type,
            targetIdx: group.target.map(i => targetCues[i].idx),
            refIdx: group.ref.map(i => refCues[i].idx),
            confidence: group.confidence,
            sim: group.sim,
            timeResidualMs: group.timeResidualMs,
            oldStartMs: targetStart,
            oldEndMs: targetEnd,
            newStartMs: outStart,
            newEndMs: outEnd,
            text: group.target.map(i => targetCues[i].text).join(' '),
            reason,
        });
    }

    // Stable sort by start time
    outCues.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
    outCues.forEach((c, i) => {
        c.idx = i + 1;
    });

    // Detect / clamp overlaps
    const overlaps: SyncReport['overlaps'] = [];
    for (let i = 0; i < outCues.length - 1; i++) {
        const a = outCues[i];
        const b = outCues[i + 1];
        if (a.endMs > b.startMs) {
            overlaps.push({ idx1: a.idx, idx2: b.idx, startMs: b.startMs, endMs: a.endMs });
            if (clampOverlap) {
                a.endMs = Math.max(b.startMs, a.startMs + MIN_DURATION_MS);
            }
        }
    }

    return {
        cues: outCues,
        report: {
            model,
            counts: {
                '1:1': count1to1,
                '1:N': count1toN,
                'M:1': countMto1,
                'M:N': countMtoN,
                unmatchedInterpolated: countInterpolated,
                unmatchedExtrapolated: countExtrapolated,
                dropped: countDropped,
                demoted: countDemoted,
                overlaps: overlaps.length,
            },
            groups: reportGroups,
            lowConfidence: reportGroups.filter(g => g.confidence > 0 && g.confidence < 0.6),
            dropped,
            overlaps,
        },
    };
}
