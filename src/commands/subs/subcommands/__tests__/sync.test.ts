import { Command } from '@commander-js/extra-typings';
import { SyncCommand } from '../sync';

const executeCommandMock = jest.fn();

jest.mock('../../../../actions/proc', () => ({
    executeCommand: (...args: unknown[]) => executeCommandMock(...args),
}));

describe('SyncCommand', () => {
    beforeEach(() => {
        executeCommandMock.mockReset();
    });

    it('runs lapse with default output path and options', async () => {
        executeCommandMock.mockResolvedValue({ code: 0, stderr: Buffer.from('') });

        const program = new Command();
        new SyncCommand().setup(program);

        await program.parseAsync(['node', 'test', 'sync', 'ref.srt', 'target.srt']);

        expect(executeCommandMock).toHaveBeenCalledTimes(1);
        const [command, args] = executeCommandMock.mock.calls[0];
        expect(command).toBe('lapse');
        expect(args).toEqual([
            expect.stringMatching(/ref\.srt$/),
            expect.stringMatching(/target\.srt$/),
            '--output',
            expect.stringMatching(/target\.srt\.synced\.srt$/),
        ]);
    });

    it('passes optional flags through to lapse', async () => {
        executeCommandMock.mockResolvedValue({ code: 0, stderr: Buffer.from('') });

        const program = new Command();
        new SyncCommand().setup(program);

        await program.parseAsync([
            'node', 'test', 'sync', 'ref.srt', 'target.srt', 'out.srt',
            '--mode', 'split', '--split-penalty', '6',
            '--confidence', '8', '--dry-run', '--strict', '--snap', '120',
            '--encoding', 'utf8', '--no-backup',
        ]);

        const [, args] = executeCommandMock.mock.calls[0];
        expect(args).toEqual([
            expect.stringMatching(/ref\.srt$/),
            expect.stringMatching(/target\.srt$/),
            'split', '6',
            '--output',
            expect.stringMatching(/out\.srt$/),
            '--no-backup',
            '--dry-run',
            '--strict',
            '--confidence', '8',
            '--snap', '120',
            '--encoding', 'utf8',
        ]);
    });

    it('throws when lapse exits with a non-zero code', async () => {
        executeCommandMock.mockResolvedValue({ code: 3, stderr: Buffer.from('unsure result') });

        const program = new Command();
        new SyncCommand().setup(program);

        await expect(program.parseAsync(['node', 'test', 'sync', 'ref.srt', 'target.srt']))
            .rejects.toThrow('unsure result');
    });
});
