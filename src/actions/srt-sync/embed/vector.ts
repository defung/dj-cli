export function l2Normalize(vec: Float32Array): Float32Array {
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

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dot = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
    }
    return dot;
}

export function weightedMeanVector(
    vectors: Float32Array[],
    weights: number[]
): Float32Array {
    if (vectors.length === 0) {
        throw new Error('weightedMeanVector: empty vectors');
    }
    if (vectors.length === 1) {
        return new Float32Array(vectors[0]);
    }

    const dim = vectors[0].length;
    const out = new Float32Array(dim);
    let totalWeight = 0;

    for (let i = 0; i < vectors.length; i++) {
        const w = weights[i] ?? 1;
        totalWeight += w;
        for (let d = 0; d < dim; d++) {
            out[d] += vectors[i][d] * w;
        }
    }

    if (totalWeight === 0) {
        return l2Normalize(new Float32Array(dim));
    }

    for (let d = 0; d < dim; d++) {
        out[d] /= totalWeight;
    }

    return l2Normalize(out);
}
