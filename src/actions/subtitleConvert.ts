/// <reference path="./subsrt.d.ts" />
import { promises as fs } from 'fs';
import path from 'path';
import subsrt from '@laxels/subsrt';

const SUPPORTED_EXTENSIONS = new Set(['srt', 'ass', 'ssa', 'vtt', 'sbv', 'sub', 'smi', 'lrc', 'json']);

function getExtension(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    return ext.startsWith('.') ? ext.slice(1) : ext;
}

function validateFormat(extension: string, role: 'input' | 'output'): void {
    if (!extension) {
        throw new Error(`${role} file must have a supported subtitle extension`);
    }

    if (!SUPPORTED_EXTENSIONS.has(extension)) {
        throw new Error(`Unsupported ${role} subtitle extension ".${extension}"`);
    }
}

function stripBom(content: string): string {
    if (content.charCodeAt(0) === 0xfeff) {
        return content.slice(1);
    }
    return content;
}

export async function convertSubtitle(inputPath: string, outputPath: string): Promise<void> {
    const inputExt = getExtension(inputPath);
    const outputExt = getExtension(outputPath);

    validateFormat(inputExt, 'input');
    validateFormat(outputExt, 'output');

    if (path.resolve(inputPath) === path.resolve(outputPath)) {
        throw new Error('Input and output paths cannot be the same file');
    }

    if (inputExt === outputExt) {
        throw new Error(`Input and output formats are the same: ".${inputExt}"`);
    }

    const rawContent = await fs.readFile(inputPath, 'utf8');
    const content = stripBom(rawContent);

    if (!content.trim()) {
        throw new Error(`Input file is empty: ${inputPath}`);
    }

    const converted = subsrt.convert(content, { from: inputExt, to: outputExt });

    await fs.writeFile(outputPath, converted, 'utf8');
}
