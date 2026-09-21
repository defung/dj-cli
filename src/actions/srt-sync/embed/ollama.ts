import { EmbeddingProvider } from '../types';
import { EmbeddingCache } from './cache';
import { l2Normalize } from './vector';

export class OllamaEmbeddingProvider implements EmbeddingProvider {
    private readonly url: string;
    private readonly model: string;
    private readonly instruction?: string;
    private readonly cache: EmbeddingCache;

    constructor(options: {
        url: string;
        model: string;
        instruction?: string;
        cacheDir?: string;
    }) {
        this.url = options.url.replace(/\/$/, '');
        this.model = options.model;
        this.instruction = options.instruction;
        this.cache = new EmbeddingCache(options.cacheDir);
    }

    name(): string {
        return `ollama:${this.model}`;
    }

    async ensureModel(): Promise<void> {
        let res: Response;
        try {
            res = await fetch(`${this.url}/api/tags`);
        } catch (error) {
            const cause = error instanceof Error ? error.message : String(error);
            throw new Error(
                `Cannot connect to Ollama at ${this.url}.\n` +
                `Make sure Ollama is running, or set a different URL with --ollama-url or OLLAMA_URL.\n` +
                `Original error: ${cause}`
            );
        }

        if (!res.ok) {
            throw new Error(
                `Ollama at ${this.url} returned an error (${res.status} ${res.statusText}).\n` +
                `Make sure Ollama is running and reachable.`
            );
        }

        const data = (await res.json()) as { models?: Array<{ name?: string }> };
        const names = (data.models ?? []).map(m => m.name ?? '');
        if (!names.some(n => n === this.model || n.startsWith(`${this.model}:`))) {
            throw new Error(
                `Ollama model '${this.model}' is not installed.\n` +
                `Install it with:\n` +
                `  ollama pull ${this.model}\n` +
                `Or choose a different model with --embed-model.`
            );
        }
    }

    async embed(texts: string[]): Promise<Float32Array[]> {
        const inputs = texts.map(t =>
            this.instruction ? `${this.instruction}\n${t}` : t
        );

        const results: (Float32Array | null)[] = new Array(texts.length).fill(null);
        const pending: Array<{ index: number; text: string; input: string }> = [];

        for (let i = 0; i < texts.length; i++) {
            const cached = await this.cache.get(this.model, this.instruction, texts[i]);
            if (cached) {
                results[i] = cached;
            } else {
                pending.push({ index: i, text: texts[i], input: inputs[i] });
            }
        }

        if (pending.length > 0) {
            const batchInputs = pending.map(p => p.input);
            const body = {
                model: this.model,
                input: batchInputs,
            };

            const res = await fetch(`${this.url}/api/embed`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(
                    `Ollama embed failed (${res.status} ${res.statusText}): ${text}`
                );
            }

            const data = (await res.json()) as { embeddings?: number[][] };
            const embeddings = data.embeddings ?? [];

            if (embeddings.length !== pending.length) {
                throw new Error(
                    `Ollama returned ${embeddings.length} embeddings for ${pending.length} texts`
                );
            }

            for (let i = 0; i < pending.length; i++) {
                const vec = l2Normalize(new Float32Array(embeddings[i]));
                await this.cache.set(this.model, this.instruction, pending[i].text, vec);
                results[pending[i].index] = vec;
            }
        }

        return results as Float32Array[];
    }
}
