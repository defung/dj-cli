import { parseSubtitles, serializeSubtitles, readSubtitleFile, sha1Text } from '../parse';
import { normalizeCueText } from '../normalize';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

describe('parse', () => {
    describe('normalizeCueText', () => {
        it('strips formatting tags', () => {
            expect(normalizeCueText('<i>Hello</i> world')).toBe('Hello world');
            expect(normalizeCueText('<b>Bold</b> and <font color="red">red</font>')).toBe(
                'Bold and red'
            );
        });

        it('strips ASS overrides and music symbols', () => {
            expect(normalizeCueText('{\\an8}Hello')).toBe('Hello');
            expect(normalizeCueText('♪ Music ♫')).toBe('Music');
        });

        it('removes leading speaker dashes', () => {
            expect(normalizeCueText('- Hello there\n- General Kenobi')).toBe(
                'Hello there General Kenobi'
            );
        });

        it('does not lowercase or transliterate', () => {
            expect(normalizeCueText('你好世界')).toBe('你好世界');
            expect(normalizeCueText('HELLO')).toBe('HELLO');
        });
    });

    describe('parseSubtitles', () => {
        it('parses a simple SRT', () => {
            const srt = `1
00:00:01,000 --> 00:00:03,000
Hello world

2
00:00:04,000 --> 00:00:06,000
Second cue
`;
            const cues = parseSubtitles(srt);
            expect(cues).toHaveLength(2);
            expect(cues[0].startMs).toBe(1000);
            expect(cues[0].endMs).toBe(3000);
            expect(cues[0].text).toBe('Hello world');
            expect(cues[1].text).toBe('Second cue');
        });

        it('handles dot millisecond separator', () => {
            const srt = `1
00:00:01.000 --> 00:00:03.000
Hello
`;
            const cues = parseSubtitles(srt);
            expect(cues[0].startMs).toBe(1000);
        });

        it('sorts and reindexes unsorted cues', () => {
            const srt = `2
00:00:04,000 --> 00:00:06,000
Second

1
00:00:01,000 --> 00:00:03,000
First
`;
            const cues = parseSubtitles(srt);
            expect(cues[0].text).toBe('First');
            expect(cues[0].idx).toBe(1);
            expect(cues[1].text).toBe('Second');
            expect(cues[1].idx).toBe(2);
        });

        it('drops empty cues', () => {
            const srt = `1
00:00:01,000 --> 00:00:03,000

2
00:00:04,000 --> 00:00:06,000
Not empty
`;
            const cues = parseSubtitles(srt);
            expect(cues).toHaveLength(1);
            expect(cues[0].text).toBe('Not empty');
        });
    });

    describe('serializeSubtitles', () => {
        it('round-trips parsed cues preserving raw text', () => {
            const srt = `1
00:00:01,000 --> 00:00:03,000
<i>Hello</i> world

2
00:00:04,000 --> 00:00:06,000
Second line
`;
            const cues = parseSubtitles(srt);
            const serialized = serializeSubtitles(cues, '\n');
            expect(serialized).toContain('00:00:01,000 --> 00:00:03,000');
            expect(serialized).toContain('<i>Hello</i> world');
        });
    });

    describe('readSubtitleFile', () => {
        it('detects UTF-8 BOM and CRLF line endings', async () => {
            const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'srt-sync-test-'));
            const file = path.join(dir, 'test.srt');
            const bom = Buffer.from([0xef, 0xbb, 0xbf]);
            const content = Buffer.from('1\r\n00:00:01,000 --> 00:00:03,000\r\nHello\r\n', 'utf8');
            await fs.writeFile(file, Buffer.concat([bom, content]));

            const result = await readSubtitleFile(file);
            expect(result.encoding).toBe('utf8');
            expect(result.lineEnding).toBe('\r\n');
            expect(result.content).not.toContain('\r');

            await fs.rm(dir, { recursive: true, force: true });
        });
    });
});
