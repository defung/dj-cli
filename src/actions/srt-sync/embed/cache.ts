import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import os from 'os';
import { sha1Text } from '../parse';

function defaultCacheDir(): string {
    const base = process.platform === 'win32'
        ? process.env.LOCALAPPDATA || os.tmpdir()
        : process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
    return path.join(base, 'dj-cli', 'srt-sync');
}

function cacheKey(model: string, instruction: string | undefined, text: string): string {
    return createHash('sha1')
        .update(`${model}\n${instruction ?? ''}\n${sha1Text(text)}`)
        .digest('hex');
}

export class EmbeddingCache {
    private dir: string;

    constructor(dir?: string) {
        this.dir = dir ?? defaultCacheDir();
    }

    async get(
        model: string,
        instruction: string | undefined,
        text: string
    ): Promise<Float32Array | null> {
        const key = cacheKey(model, instruction, text);
        const file = path.join(this.dir, `${key}.bin`);
        try {
            const buf = await fs.readFile(file);
            return new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
        } catch {
            return null;
        }
    }

    async set(
        model: string,
        instruction: string | undefined,
        text: string,
        vector: Float32Array
    ): Promise<void> {
        const key = cacheKey(model, instruction, text);
        const file = path.join(this.dir, `${key}.bin`);
        await fs.mkdir(this.dir, { recursive: true });
        const buf = Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
        await fs.writeFile(file, buf);
    }

    async clear(): Promise<void> {
        try {
            await fs.rm(this.dir, { recursive: true, force: true });
        } catch {
            // ignore
        }
    }
}
