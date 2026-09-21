import { fitTimeModel } from '../timing/fit';

describe('fitTimeModel', () => {
    it('fits a constant offset', () => {
        const points = Array.from({ length: 20 }, (_, i) => ({
            targetMs: i * 5000,
            refMs: i * 5000 + 2300,
        }));
        const model = fitTimeModel(points, 'auto');
        expect(model.mode).toBe('offset');
        expect(model.a).toBe(1);
        expect(model.b).toBeCloseTo(2300, 0);
        expect(model.inliers).toBeGreaterThanOrEqual(20);
    });

    it('fits a linear drift', () => {
        const a = 25 / 24;
        const b = 1000;
        const points = Array.from({ length: 30 }, (_, i) => ({
            targetMs: i * 5000,
            refMs: a * i * 5000 + b,
        }));
        const model = fitTimeModel(points, 'auto');
        expect(model.mode).toBe('drift');
        expect(model.a).toBeCloseTo(a, 3);
        expect(model.b).toBeCloseTo(b, 0);
    });

    it('rejects outliers', () => {
        const points = Array.from({ length: 20 }, (_, i) => ({
            targetMs: i * 5000,
            refMs: i * 5000 + 2000,
        }));
        // Add outliers
        points.push({ targetMs: 1000, refMs: 60000 });
        points.push({ targetMs: 95000, refMs: 5000 });

        const model = fitTimeModel(points, 'offset');
        expect(model.a).toBe(1);
        expect(model.b).toBeCloseTo(2000, 0);
        expect(model.inliers).toBeGreaterThanOrEqual(18);
    });

    it('throws when too few points', () => {
        const points = [
            { targetMs: 0, refMs: 1000 },
            { targetMs: 1000, refMs: 2000 },
        ];
        expect(() => fitTimeModel(points, 'auto')).toThrow();
    });
});
