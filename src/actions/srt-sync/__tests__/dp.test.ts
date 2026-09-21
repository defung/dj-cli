import { Cue, TimeModel } from '../types';
import { FakeEmbeddingProvider } from '../embed/fake';
import { align, DPOptions } from '../align/dp';

function cue(idx: number, start: number, end: number, text: string): Cue {
    return { idx, startMs: start * 1000, endMs: end * 1000, raw: text, text };
}

describe('align DP', () => {
    it('aligns identical cue sequences 1:1', async () => {
        const texts = ['alpha', 'beta', 'gamma', 'delta'];
        const provider = new FakeEmbeddingProvider(32, 0);
        for (const t of texts) {
            provider.setConcept(t, texts.map(x => (x === t ? 1 : 0)));
        }

        const targetCues = texts.map((t, i) => cue(i + 1, i * 5, i * 5 + 3, t));
        const refCues = texts.map((t, i) => cue(i + 1, i * 5 + 2, i * 5 + 5, t));

        const targetVectors = await provider.embed(texts);
        const refVectors = await provider.embed(texts);

        const model: TimeModel = { a: 1, b: 2000, inliers: 4, total: 4, mode: 'offset', residualMs: 0 };
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
        const ones = groups.filter(g => g.target.length === 1 && g.ref.length === 1);
        expect(ones.length).toBe(4);
    });

    it('handles a target split (M:1)', async () => {
        const targetTexts = ['a', 'b', 'c'];
        const refTexts = ['abc'];

        const provider = new FakeEmbeddingProvider(32, 0);
        provider.setConcept('abc', [1, 0, 0, 0]);
        provider.setConcept('a', [0.9, 0.05, 0.05, 0]);
        provider.setConcept('b', [0.05, 0.9, 0.05, 0]);
        provider.setConcept('c', [0.05, 0.05, 0.9, 0]);

        const targetCues = [
            cue(1, 1, 2, 'a'),
            cue(2, 2, 3, 'b'),
            cue(3, 3, 5, 'c'),
        ];
        const refCues = [cue(1, 2, 5, 'abc')];

        const targetVectors = await provider.embed(targetTexts);
        const refVectors = await provider.embed(refTexts);

        const model: TimeModel = { a: 1, b: 1000, inliers: 3, total: 3, mode: 'offset', residualMs: 0 };
        const options: DPOptions = {
            maxGroup: 3,
            skipPenalty: 0.5,
            timeToleranceMs: 1500,
            shapePenalty: 0.001,
            bandSeconds: 10,
            minConfidence: 0.3,
            timeModel: model,
        };

        const groups = align(targetCues, refCues, targetVectors, refVectors, options);
        const mto1 = groups.find(g => g.target.length === 3 && g.ref.length === 1);
        expect(mto1).toBeDefined();
    });

    it('handles a target merge (1:N)', async () => {
        const targetTexts = ['abc'];
        const refTexts = ['a', 'b', 'c'];

        const provider = new FakeEmbeddingProvider(32, 0);
        provider.setConcept('abc', [1, 0, 0, 0]);
        provider.setConcept('a', [0.9, 0.05, 0.05, 0]);
        provider.setConcept('b', [0.05, 0.9, 0.05, 0]);
        provider.setConcept('c', [0.05, 0.05, 0.9, 0]);

        const targetCues = [cue(1, 1, 5, 'abc')];
        const refCues = [
            cue(1, 2, 3, 'a'),
            cue(2, 3, 4, 'b'),
            cue(3, 4, 5, 'c'),
        ];

        const targetVectors = await provider.embed(targetTexts);
        const refVectors = await provider.embed(refTexts);

        const model: TimeModel = { a: 1, b: 1000, inliers: 1, total: 1, mode: 'offset', residualMs: 0 };
        const options: DPOptions = {
            maxGroup: 3,
            skipPenalty: 0.5,
            timeToleranceMs: 1500,
            shapePenalty: 0.001,
            bandSeconds: 10,
            minConfidence: 0.3,
            timeModel: model,
        };

        const groups = align(targetCues, refCues, targetVectors, refVectors, options);
        const oneton = groups.find(g => g.target.length === 1 && g.ref.length === 3);
        expect(oneton).toBeDefined();
    });
});
