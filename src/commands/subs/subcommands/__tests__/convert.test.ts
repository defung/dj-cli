import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { Command } from "@commander-js/extra-typings";
import { ConvertCommand } from '../convert';

describe('ConvertCommand', () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dj-convert-'));
    });

    afterEach(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    async function runConvert(input: string, output: string): Promise<void> {
        const program = new Command();
        new ConvertCommand().setup(program);
        await program.parseAsync(['node', 'test', 'convert', input, output]);
    }

    it('converts SRT to ASS', async () => {
        const inputPath = path.join(tmpDir, 'input.srt');
        const outputPath = path.join(tmpDir, 'output.ass');

        await fs.writeFile(inputPath, '1\n00:00:01,000 --> 00:00:03,000\nHello\n');

        await runConvert(inputPath, outputPath);

        const output = await fs.readFile(outputPath, 'utf8');
        expect(output).toContain('[Script Info]');
        expect(output).toContain('Dialogue:');
        expect(output).toContain('Hello');
    });

    it('converts ASS to SRT', async () => {
        const inputPath = path.join(tmpDir, 'input.ass');
        const outputPath = path.join(tmpDir, 'output.srt');

        await fs.writeFile(inputPath, `
[Script Info]
Title: Test

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,Hello
        `.trim() + '\n');

        await runConvert(inputPath, outputPath);

        const output = await fs.readFile(outputPath, 'utf8');
        expect(output).toContain('1');
        expect(output).toContain('00:00:01,000 --> 00:00:03,000');
        expect(output).toContain('Hello');
    });

    it('rejects unsupported input extension', async () => {
        const inputPath = path.join(tmpDir, 'input.txt');
        const outputPath = path.join(tmpDir, 'output.srt');
        await fs.writeFile(inputPath, 'dummy');

        await expect(runConvert(inputPath, outputPath)).rejects.toThrow('Unsupported input subtitle extension ".txt"');
    });

    it('rejects unsupported output extension', async () => {
        const inputPath = path.join(tmpDir, 'input.srt');
        const outputPath = path.join(tmpDir, 'output.doc');
        await fs.writeFile(inputPath, '1\n00:00:01,000 --> 00:00:02,000\nHello\n');

        await expect(runConvert(inputPath, outputPath)).rejects.toThrow('Unsupported output subtitle extension ".doc"');
    });

    it('rejects identical input and output formats', async () => {
        const inputPath = path.join(tmpDir, 'input.srt');
        const outputPath = path.join(tmpDir, 'output.srt');
        await fs.writeFile(inputPath, '1\n00:00:01,000 --> 00:00:02,000\nHello\n');

        await expect(runConvert(inputPath, outputPath)).rejects.toThrow('Input and output formats are the same: ".srt"');
    });
});
