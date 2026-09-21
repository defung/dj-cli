import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import { Node, parseSync, stringifySync } from 'subtitle';
import { Cue } from './types';
import { normalizeCueText } from './normalize';

const TIMESTAMP_REGEX = /^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})/;

function detectEncoding(buffer: Buffer): { encoding: string; content: string } {
    if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
        return { encoding: 'utf8', content: buffer.toString('utf8', 3) };
    }
    if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
        return { encoding: 'utf16le', content: buffer.toString('utf16le', 2) };
    }
    if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
        // Node does not have utf16be; swap bytes then decode as LE
        const swapped = Buffer.from(buffer.subarray(2));
        for (let i = 0; i + 1 < swapped.length; i += 2) {
            const tmp = swapped[i];
            swapped[i] = swapped[i + 1];
            swapped[i + 1] = tmp;
        }
        return { encoding: 'utf16be', content: swapped.toString('utf16le') };
    }
    return { encoding: 'utf8', content: buffer.toString('utf8') };
}

export async function readSubtitleFile(
    filePath: string,
    encodingOverride?: string
): Promise<{ content: string; encoding: string; lineEnding: string }> {
    const buffer = await fs.readFile(filePath);
    const detected = encodingOverride
        ? { encoding: encodingOverride, content: buffer.toString(encodingOverride as BufferEncoding) }
        : detectEncoding(buffer);

    const lineEnding = detected.content.includes('\r\n') ? '\r\n' : '\n';
    const normalized = detected.content.replace(/\r\n|\r/g, '\n');

    return { content: normalized, encoding: detected.encoding, lineEnding };
}

function parseTimestamp(line: string): { startMs: number; endMs: number } | null {
    const match = TIMESTAMP_REGEX.exec(line);
    if (!match) return null;

    const [, h1, m1, s1, ms1, h2, m2, s2, ms2] = match;
    const startMs =
        parseInt(h1, 10) * 3600000 +
        parseInt(m1, 10) * 60000 +
        parseInt(s1, 10) * 1000 +
        parseInt(ms1, 10);
    const endMs =
        parseInt(h2, 10) * 3600000 +
        parseInt(m2, 10) * 60000 +
        parseInt(s2, 10) * 1000 +
        parseInt(ms2, 10);

    return { startMs, endMs };
}

function parseSrtManually(content: string): Array<{ startMs: number; endMs: number; raw: string }> {
    const cues: Array<{ startMs: number; endMs: number; raw: string }> = [];
    const blocks = content.split(/\n\s*\n/);

    for (const block of blocks) {
        const lines = block.split('\n').filter(l => l.trim() !== '');
        if (lines.length < 2) continue;

        // First line is usually the index number; skip if timestamp is on next line
        let timestampLine = lines[0];
        let textLines = lines.slice(1);
        let ts = parseTimestamp(timestampLine);

        if (!ts && lines.length >= 2) {
            timestampLine = lines[1];
            textLines = lines.slice(2);
            ts = parseTimestamp(timestampLine);
        }

        if (!ts) continue;

        const raw = textLines.join('\n');
        if (raw.trim().length === 0) continue; // drop empty cues

        cues.push({ startMs: ts.startMs, endMs: ts.endMs, raw });
    }

    return cues;
}

export function parseSubtitles(content: string): Cue[] {
    let nodes: Node[];
    try {
        nodes = parseSync(content);
    } catch {
        // Fallback to a more tolerant parser
        return parseSrtManually(content).map((c, i) => ({
            idx: i + 1,
            startMs: c.startMs,
            endMs: c.endMs,
            raw: c.raw,
            text: normalizeCueText(c.raw),
        }));
    }

    const cues: Cue[] = [];
    for (const node of nodes) {
        if (node.type !== 'cue') continue;
        const raw = node.data.text;
        if (!raw || raw.trim().length === 0) continue;

        cues.push({
            idx: cues.length + 1,
            startMs: node.data.start,
            endMs: node.data.end,
            raw,
            text: normalizeCueText(raw),
        });
    }

    // Stable sort by start time; if already sorted this preserves order
    cues.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

    // Re-index after sorting
    cues.forEach((c, i) => {
        c.idx = i + 1;
    });

    return cues;
}

export function serializeSubtitles(
    cues: Cue[],
    lineEnding: string
): string {
    const nodes: Node[] = cues.map(c => ({
        type: 'cue',
        data: {
            start: c.startMs,
            end: c.endMs,
            text: c.raw,
            settings: '',
        },
    }));

    const serialized = stringifySync(nodes, { format: 'SRT' });
    return lineEnding === '\n' ? serialized : serialized.replace(/\n/g, lineEnding);
}

export function sha1Text(text: string): string {
    return createHash('sha1').update(text, 'utf8').digest('hex');
}
