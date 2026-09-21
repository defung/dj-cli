import { Cue, Group, TimeModel } from '../types';
import { assignTimings } from '../retime/assign';

function cue(idx: number, start: number, end: number, text: string): Cue {
    return { idx, startMs: start * 1000, endMs: end * 1000, raw: text, text };
}

const offsetModel: TimeModel = { a: 1, b: 1000, inliers: 10, total: 12, mode: 'offset', residualMs: 50 };

describe('assignTimings', () => {
    it('handles the worked M:1 example from the spec', () => {
        const targetCues = [
            cue(1, 1, 2, 'a'),
            cue(2, 2, 3, 'b'),
            cue(3, 3, 5, 'c'),
        ];
        const refCues = [cue(1, 2, 5, 'abc')];

        const groups: Group[] = [
            { target: [0, 1, 2], ref: [0], sim: 0.9, timeResidualMs: 0, confidence: 0.9, status: 'matched' },
        ];

        const { cues } = assignTimings(targetCues, refCues, groups, offsetModel);
        expect(cues).toHaveLength(3);
        expect(cues[0].startMs).toBe(2000);
        expect(cues[0].endMs).toBe(3000);
        expect(cues[1].startMs).toBe(3000);
        expect(cues[1].endMs).toBe(4000);
        expect(cues[2].startMs).toBe(4000);
        expect(cues[2].endMs).toBe(6000);
    });

    it('copies reference timings for 1:1 matches', () => {
        const targetCues = [cue(1, 1, 3, 'hello')];
        const refCues = [cue(1, 2, 4, 'bonjour')];

        const groups: Group[] = [
            { target: [0], ref: [0], sim: 0.9, timeResidualMs: 0, confidence: 0.9, status: 'matched' },
        ];

        const { cues } = assignTimings(targetCues, refCues, groups, offsetModel);
        expect(cues[0].startMs).toBe(2000);
        expect(cues[0].endMs).toBe(4000);
    });

    it('spans reference range for 1:N matches', () => {
        const targetCues = [cue(1, 1, 5, 'abc')];
        const refCues = [cue(1, 2, 3, 'a'), cue(2, 3, 5, 'b c')];

        const groups: Group[] = [
            { target: [0], ref: [0, 1], sim: 0.9, timeResidualMs: 0, confidence: 0.9, status: 'matched' },
        ];

        const { cues } = assignTimings(targetCues, refCues, groups, offsetModel);
        expect(cues[0].startMs).toBe(2000);
        expect(cues[0].endMs).toBe(5000);
    });

    it('interpolates unmatched cues between anchors', () => {
        // anchors: target 100s -> out 105s, target 110s -> out 113s
        // extra cue at target 104s-106s
        const targetCues = [
            cue(1, 100, 101, 'anchor1'),
            cue(2, 104, 106, 'extra'),
            cue(3, 110, 111, 'anchor2'),
        ];
        const refCues = [
            cue(1, 105, 106, 'anchor1'),
            cue(2, 113, 114, 'anchor2'),
        ];

        const groups: Group[] = [
            { target: [0], ref: [0], sim: 0.9, timeResidualMs: 0, confidence: 0.9, status: 'matched' },
            { target: [2], ref: [1], sim: 0.9, timeResidualMs: 0, confidence: 0.9, status: 'matched' },
            { target: [1], ref: [], sim: 0, timeResidualMs: 0, confidence: 0, status: 'matched', reason: 'target-extra' },
        ];

        const model: TimeModel = { ...offsetModel, b: 5000 };
        const { cues, report } = assignTimings(targetCues, refCues, groups, model);
        const extra = cues.find(c => c.text === 'extra');
        expect(extra).toBeDefined();
        // Anchor points are built from (firstStart -> outFirstStart) and (lastEnd -> outLastEnd)
        // for each matched group, then piecewise-linear interpolation is applied.
        expect(extra!.startMs).toBeCloseTo(108333, 0);
        expect(extra!.endMs).toBeCloseTo(109889, 0);
        expect(report.counts.unmatchedInterpolated).toBe(1);
    });

    it('shifts negative-start cues to zero preserving duration', () => {
        const targetCues = [cue(1, -2, 0, 'negative')];
        const refCues: Cue[] = [];

        const groups: Group[] = [
            { target: [0], ref: [], sim: 0, timeResidualMs: 0, confidence: 0, status: 'matched', reason: 'target-extra' },
        ];

        const { cues, report } = assignTimings(targetCues, refCues, groups, offsetModel);
        expect(cues).toHaveLength(1);
        expect(cues[0].startMs).toBe(0);
        expect(cues[0].endMs).toBe(2000);
        expect(report.counts.unmatchedExtrapolated).toBe(1);
    });

    it('drops cues fully before zero', () => {
        const targetCues = [cue(1, -5, -1, 'dropped')];
        const refCues: Cue[] = [];

        const groups: Group[] = [
            { target: [0], ref: [], sim: 0, timeResidualMs: 0, confidence: 0, status: 'matched', reason: 'target-extra' },
        ];

        const { cues, report } = assignTimings(targetCues, refCues, groups, offsetModel);
        expect(cues).toHaveLength(0);
        expect(report.counts.dropped).toBe(1);
    });
});
