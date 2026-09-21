import { Cue, TimeModel } from '../types';
import { FakeEmbeddingProvider } from '../embed/fake';
import { align, DPOptions } from '../align/dp';
import { refineAlignment } from '../align/refine';
import { assignTimings } from '../retime/assign';
import { computeConfidence } from '../align/confidence';

function cue(idx: number, start: number, end: number, text: string, raw?: string): Cue {
    return {
        idx,
        startMs: start * 1000,
        endMs: end * 1000,
        raw: raw ?? text,
        text,
    };
}

describe('business logic scenarios', () => {
    it('DP alignment produces groups even when scene timings diverge', async () => {
        // Reference: evenly spaced cues
        const refTexts = Array.from({ length: 20 }, (_, i) => `ref${i}`);
        // Target: starts earlier and has scene-level compression/expansion
        const targetTexts = Array.from({ length: 20 }, (_, i) => `ref${i}`);

        const provider = new FakeEmbeddingProvider(32, 0);
        for (let i = 0; i < 20; i++) {
            const vec = Array(32).fill(0);
            vec[i] = 1;
            provider.setConcept(refTexts[i], vec);
            provider.setConcept(targetTexts[i], vec);
        }

        const refCues = refTexts.map((t, i) => cue(i + 1, i * 5 + 10, i * 5 + 13, t));
        const targetCues = targetTexts.map((t, i) => cue(i + 1, i * 4 + 2, i * 4 + 5, t));

        const targetVectors = await provider.embed(targetCues.map(c => c.text));
        const refVectors = await provider.embed(refCues.map(c => c.text));

        // Model is intentionally a bit off to simulate scene divergence
        const model: TimeModel = { a: 1, b: 7000, inliers: 20, total: 20, mode: 'offset', residualMs: 0 };
        const options: DPOptions = {
            maxGroup: 2,
            skipPenalty: 0.5,
            timeToleranceMs: 1500,
            shapePenalty: 0.01,
            bandSeconds: 10,
            minConfidence: 0.3,
            timeModel: model,
        };

        const groups = align(targetCues, refCues, targetVectors, refVectors, options);
        expect(groups.length).toBeGreaterThan(0);
        expect(groups.some(g => g.target.length > 0 && g.ref.length > 0)).toBe(true);
    });

    it('confidence does not demote a 1:1 match with good time alignment', () => {
        const confidence = computeConfidence(
            0.52, // modest similarity
            0.2, // margin over runner-up
            700, // good time residual
            1500
        );
        expect(confidence).toBeGreaterThan(0.45);
    });

    it('matches a mixed-content target cue to a single reference cue', async () => {
        const refCues = [cue(1, 3950, 3953, 'I know who Kingfisher is.')];
        const targetCues = [
            cue(
                1,
                3924,
                3926,
                '《Title Card》 (<OST>Artist - Song) I know who Kingfisher is.',
                '《Title Card》\n(<OST>Artist - Song)\nI know who Kingfisher is.'
            ),
        ];

        const provider = new FakeEmbeddingProvider(32, 0);
        // Reference vector: pure dialogue axis
        const refVec = Array(32).fill(0);
        refVec[0] = 1;
        provider.setConcept(refCues[0].text, refVec);

        // Target vector: diluted by credit/title content, but still has dialogue component
        const targetVec = Array(32).fill(0);
        targetVec[0] = 0.55;
        targetVec[1] = 0.45;
        provider.setConcept(targetCues[0].text, targetVec);

        const targetVectors = await provider.embed(targetCues.map(c => c.text));
        const refVectors = await provider.embed(refCues.map(c => c.text));

        const model: TimeModel = { a: 1, b: 26000, inliers: 1, total: 1, mode: 'offset', residualMs: 0 };
        const options: DPOptions = {
            maxGroup: 2,
            skipPenalty: 0.5,
            timeToleranceMs: 1500,
            shapePenalty: 0.01,
            bandSeconds: 45,
            minConfidence: 0.45,
            timeModel: model,
        };

        const groups = align(targetCues, refCues, targetVectors, refVectors, options);
        expect(groups.length).toBe(1);
        expect(groups[0].target.length).toBe(1);
        expect(groups[0].ref.length).toBe(1);

        const { cues } = assignTimings(targetCues, refCues, groups, model);
        expect(cues[0].startMs).toBe(refCues[0].startMs);
        expect(cues[0].endMs).toBe(refCues[0].endMs);
    });

    it('keeps mixed-content cue text intact for embedding', () => {
        const cues = [
            cue(
                1,
                0,
                2,
                '《Title》\n(<OST>Artist - Song)\nI know who Kingfisher is.',
                '《Title》\n(<OST>Artist - Song)\nI know who Kingfisher is.'
            ),
        ];

        expect(cues[0].raw).toContain('《Title》');
        expect(cues[0].text).toContain('《Title》');
        expect(cues[0].text).toContain('I know who Kingfisher is.');
    });
});
