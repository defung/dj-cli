declare module '@laxels/subsrt' {
    export interface SubsrtConvertOptions {
        to: string;
        from?: string;
        format?: string;
        eol?: string;
        fps?: number;
        resync?: unknown;
        verbose?: boolean;
    }

    export function convert(content: string, options: SubsrtConvertOptions | string): string;
    export function detect(content: string): string | undefined;
    export function parse(content: string, options?: { format?: string; verbose?: boolean }): unknown[];
    export function build(captions: unknown[], options?: { format?: string; verbose?: boolean }): string;
    export function list(): string[];
}
