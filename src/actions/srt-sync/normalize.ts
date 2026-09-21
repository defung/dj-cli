/**
 * Normalize cue text for embedding.
 * Only script-neutral rules:
 * - Strip formatting tags (<i>, <b>, <u>, <font ...> ... </font>)
 * - Strip ASS-style overrides ({\an8}, {\pos(...)} etc.)
 * - Remove common music symbols (♪ ♫)
 * - Remove leading speaker dashes
 * - Collapse newlines and repeated whitespace
 * Does NOT lowercase, transliterate, or assume a language.
 */
export function normalizeCueText(raw: string): string {
    return raw
        .replace(/<\s*\/?\s*(?:i|b|u|font)(?:\s+[^>]*)?\s*>/gi, ' ')
        .replace(/\{[^}]*\}/g, ' ')
        .replace(/[♪♫]/g, ' ')
        .replace(/^\s*-\s*/gm, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
