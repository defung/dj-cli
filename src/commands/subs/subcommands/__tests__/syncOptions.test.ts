import { parseSyncOptions, buildSyncArgs } from '../syncOptions';

describe('parseSyncOptions', () => {
    it('uses defaults when only required fields are provided', () => {
        const parsed = parseSyncOptions({ mode: 'auto' });
        expect(parsed).toEqual({
            mode: 'auto',
            dryRun: false,
            strict: false,
            noBackup: false,
        });
    });

    it('parses all supported options', () => {
        const parsed = parseSyncOptions({
            mode: 'split',
            confidence: '12',
            splitPenalty: '8',
            dryRun: true,
            strict: true,
            snap: '120',
            encoding: 'utf8',
            backup: false,
        });
        expect(parsed).toEqual({
            mode: 'split',
            confidence: 12,
            splitPenalty: 8,
            dryRun: true,
            strict: true,
            snap: 120,
            encoding: 'utf8',
            noBackup: true,
        });
    });

    it('parses snap when passed without a value', () => {
        const parsed = parseSyncOptions({
            mode: 'auto',
            snap: true,
        });
        expect(parsed.snap).toBe(true);
    });

    it('rejects invalid mode', () => {
        expect(() => parseSyncOptions({ mode: 'offset' })).toThrow(
            '--mode must be one of: auto, nosplit, ols, split'
        );
    });

    it('rejects negative confidence', () => {
        expect(() => parseSyncOptions({ mode: 'auto', confidence: '-1' })).toThrow(
            '--confidence must be non-negative'
        );
    });

    it('rejects invalid split penalty', () => {
        expect(() => parseSyncOptions({ mode: 'split', splitPenalty: 'abc' })).toThrow(
            '--split-penalty must be non-negative'
        );
    });

    it('rejects invalid snap value', () => {
        expect(() => parseSyncOptions({ mode: 'auto', snap: '-10' })).toThrow(
            '--snap must be a non-negative integer'
        );
    });
});

describe('buildSyncArgs', () => {
    it('builds args for auto mode with default output handling', () => {
        const args = buildSyncArgs('ref.srt', 'target.srt', 'target.synced.srt', {
            mode: 'auto',
            dryRun: false,
            strict: false,
            noBackup: true,
        });
        expect(args).toEqual([
            'ref.srt',
            'target.srt',
            '--output',
            'target.synced.srt',
            '--no-backup',
        ]);
    });

    it('builds args for ols mode', () => {
        const args = buildSyncArgs('ref.srt', 'target.srt', 'out.srt', {
            mode: 'ols',
            dryRun: false,
            strict: false,
            noBackup: false,
        });
        expect(args).toEqual(['ref.srt', 'target.srt', 'ols', '--output', 'out.srt']);
    });

    it('builds args for split mode with penalty', () => {
        const args = buildSyncArgs('ref.srt', 'target.srt', 'out.srt', {
            mode: 'split',
            splitPenalty: 6,
            dryRun: false,
            strict: false,
            noBackup: false,
        });
        expect(args).toEqual([
            'ref.srt',
            'target.srt',
            'split',
            '6',
            '--output',
            'out.srt',
        ]);
    });

    it('builds args with all optional flags', () => {
        const args = buildSyncArgs('ref.srt', 'target.srt', 'out.srt', {
            mode: 'auto',
            confidence: 8,
            dryRun: true,
            strict: true,
            snap: 120,
            encoding: 'utf8',
            noBackup: true,
        });
        expect(args).toEqual([
            'ref.srt',
            'target.srt',
            '--output',
            'out.srt',
            '--no-backup',
            '--dry-run',
            '--strict',
            '--confidence',
            '8',
            '--snap',
            '120',
            '--encoding',
            'utf8',
        ]);
    });

    it('builds args with snap flag and no explicit value', () => {
        const args = buildSyncArgs('ref.srt', 'target.srt', 'out.srt', {
            mode: 'auto',
            snap: true,
            dryRun: false,
            strict: false,
            noBackup: false,
        });
        expect(args).toEqual([
            'ref.srt',
            'target.srt',
            '--output',
            'out.srt',
            '--snap',
        ]);
    });
});
