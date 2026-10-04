import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { Command } from '@commander-js/extra-typings';
import { MergeBatchCommand } from '../mergeBatch';

const mergeSrtFilesMock = jest.fn();

jest.mock('../../../../actions/subs', () => ({
    mergeSrtFiles: (...args: unknown[]) => mergeSrtFilesMock(...args),
}));

describe('MergeBatchCommand', () => {
    let tmpDir: string;

    beforeEach(async () => {
        mergeSrtFilesMock.mockReset();
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'merge-batch-test-'));
    });

    afterEach(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    async function createFile(name: string): Promise<void> {
        await fs.writeFile(path.join(tmpDir, name), '1\n00:00:01,000 --> 00:00:02,000\ntext\n', 'utf8');
    }

    it('merges discovered pairs with default colors', async () => {
        await createFile('movie.eng.srt');
        await createFile('movie.chi.srt');

        const program = new Command();
        new MergeBatchCommand().setup(program);

        await program.parseAsync(['node', 'test', 'merge-batch', tmpDir, '--lang1', 'eng', '--lang2', 'chi', '--yes']);

        expect(mergeSrtFilesMock).toHaveBeenCalledTimes(1);
        expect(mergeSrtFilesMock).toHaveBeenCalledWith({
            subtitle1: { path: path.join(tmpDir, 'movie.eng.srt'), color: 'white' },
            subtitle2: { path: path.join(tmpDir, 'movie.chi.srt'), color: 'yellow' },
            outputPath: path.join(tmpDir, 'movie.engchi.srt'),
        });
    });

    it('uses custom colors when provided', async () => {
        await createFile('movie.eng.srt');
        await createFile('movie.chi.srt');

        const program = new Command();
        new MergeBatchCommand().setup(program);

        await program.parseAsync([
            'node', 'test', 'merge-batch', tmpDir,
            '--lang1', 'eng', '--lang2', 'chi',
            '--color1', 'red', '--color2', 'blue',
            '--yes',
        ]);

        expect(mergeSrtFilesMock).toHaveBeenCalledWith({
            subtitle1: { path: path.join(tmpDir, 'movie.eng.srt'), color: 'red' },
            subtitle2: { path: path.join(tmpDir, 'movie.chi.srt'), color: 'blue' },
            outputPath: path.join(tmpDir, 'movie.engchi.srt'),
        });
    });

    it('uses separate directories when provided', async () => {
        const dir1 = path.join(tmpDir, 'lang1');
        const dir2 = path.join(tmpDir, 'lang2');
        await fs.mkdir(dir1);
        await fs.mkdir(dir2);
        await fs.writeFile(path.join(dir1, 'movie.eng.srt'), 'content', 'utf8');
        await fs.writeFile(path.join(dir2, 'movie.chi.srt'), 'content', 'utf8');

        const program = new Command();
        new MergeBatchCommand().setup(program);

        await program.parseAsync([
            'node', 'test', 'merge-batch', tmpDir,
            '--lang1', 'eng', '--lang2', 'chi',
            '--dir1', dir1, '--dir2', dir2,
            '--yes',
        ]);

        expect(mergeSrtFilesMock).toHaveBeenCalledWith({
            subtitle1: { path: path.join(dir1, 'movie.eng.srt'), color: 'white' },
            subtitle2: { path: path.join(dir2, 'movie.chi.srt'), color: 'yellow' },
            outputPath: path.join(dir2, 'movie.engchi.srt'),
        });
    });

    it('throws when one or more merges fail', async () => {
        await createFile('movie.eng.srt');
        await createFile('movie.chi.srt');
        mergeSrtFilesMock.mockRejectedValue(new Error('merge failed'));

        const program = new Command();
        new MergeBatchCommand().setup(program);

        await expect(program.parseAsync(['node', 'test', 'merge-batch', tmpDir, '--lang1', 'eng', '--lang2', 'chi', '--yes']))
            .rejects.toThrow('One or more merges failed.');
    });
});
