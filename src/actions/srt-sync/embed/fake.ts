import { EmbeddingProvider } from '../types';

/**
 * Deterministic fake embedder for tests.
 * Maps each distinct text to a stable "concept" vector by hashing.
 * Optionally adds controllable noise.
 */
export class FakeEmbeddingProvider implements EmbeddingProvider {
    private readonly dim: number;
    private readonly noise: number;
    private readonly conceptMap: Map<string, Float32Array> = new Map();

    constructor(dim = 64, noise = 0.0) {
        this.dim = dim;
        this.noise = noise;
    }

    name(): string {
        return 'fake';
    }

    setConcept(text: string, vector: number[]): void {
        const v = new Float32Array(this.dim);
        for (let i = 0; i < Math.min(vector.length, this.dim); i++) {
            v[i] = vector[i];
        }
        this.conceptMap.set(text, this.normalize(v));
    }

    async embed(texts: string[]): Promise<Float32Array[]> {
        return texts.map(t => this.vectorFor(t));
    }

    private vectorFor(text: string): Float32Array {
        const mapped = this.conceptMap.get(text);
        if (mapped) {
            return this.maybeAddNoise(mapped);
        }

        // Deterministic hash-based vector
        const v = new Float32Array(this.dim);
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            hash = (hash * 31 + text.charCodeAt(i)) | 0;
            v[Math.abs(hash) % this.dim] += Math.sin(hash) * 0.5;
        }
        return this.maybeAddNoise(this.normalize(v));
    }

    private maybeAddNoise(vec: Float32Array): Float32Array {
        if (this.noise === 0) return vec;
        const out = new Float32Array(vec.length);
        for (let i = 0; i < vec.length; i++) {
            out[i] = vec[i] + (Math.random() - 0.5) * this.noise;
        }
        return this.normalize(out);
    }

    private normalize(vec: Float32Array): Float32Array {
        let sum = 0;
        for (let i = 0; i < vec.length; i++) {
            sum += vec[i] * vec[i];
        }
        const norm = Math.sqrt(sum) || 1;
        const out = new Float32Array(vec.length);
        for (let i = 0; i < vec.length; i++) {
            out[i] = vec[i] / norm;
        }
        return out;
    }
}
