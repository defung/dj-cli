import { FakeEmbeddingProvider } from '../embed/fake';
import { parseSubtitles, serializeSubtitles } from '../parse';
import { fitTimeModel } from '../timing/fit';
import { findAnchorCandidates } from '../align/candidates';
import { refineAlignment } from '../align/refine';
import { assignTimings } from '../retime/assign';

describe('srt-sync end-to-end with fake embedder', () => {
    it('retimes a simple offset target', async () => {
        const refTexts = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta'];
        const targetTexts = [...refTexts];

        const provider = new FakeEmbeddingProvider(32, 0);
        for (const t of refTexts) {
            provider.setConcept(t, refTexts.map(x => (x === t ? 1 : 0)));
        }

        const refSrt = refTexts.map((t, i) => `${i + 1}\n00:00:${String(i * 3 + 1).padStart(2, '0')},000 --> 00:00:${String(i * 3 + 3).padStart(2, '0')},000\n${t}`).join('\n\n') + '\n';
        const targetSrt = refTexts.map((t, i) => `${i + 1}\n00:00:${String(i * 3 + 2).padStart(2, '0')},000 --> 00:00:${String(i * 3 + 4).padStart(2, '0')},000\n${t}`).join('\n\n') + '\n';

        const refCues = parseSubtitles(refSrt);
        const targetCues = parseSubtitles(targetSrt);

        const targetVectors = await provider.embed(targetCues.map(c => c.text));
        const refVectors = await provider.embed(refCues.map(c => c.text));

        const anchors = findAnchorCandidates(targetCues, refCues, targetVectors, refVectors, 0.3);
        expect(anchors.length).toBeGreaterThanOrEqual(4);

        const initialModel = fitTimeModel(
            anchors.map(a => ({ targetMs: a.targetMs, refMs: a.refMs })),
            'auto'
        );
        expect(initialModel.a).toBe(1);
        expect(initialModel.b).toBeCloseTo(-1000, 0);

        const { groups, model } = refineAlignment(
            targetCues,
            refCues,
            targetVectors,
            refVectors,
            initialModel,
            {
                maxGroup: 2,
                skipPenalty: 0.5,
                timeToleranceMs: 1500,
                shapePenalty: 0.01,
                bandSeconds: 10,
                minConfidence: 0.3,
                mode: 'auto',
            }
        );

        const { cues, report } = assignTimings(targetCues, refCues, groups, model);
        expect(report.counts['1:1']).toBe(refTexts.length);

        const serialized = serializeSubtitles(cues, '\n');
        expect(serialized).toContain('00:00:01,000 --> 00:00:03,000');
        expect(serialized).toContain('00:00:04,000 --> 00:00:06,000');
    });

});
