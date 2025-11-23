import { promises as fs } from "fs";
import path from "path";
import {executeCommand, readInput} from "./proc";
import {getFileInfo, getPathInfo} from "./files";
import { parseSync, stringifySync, Node } from 'subtitle'
import {ParsedPath} from "node:path";

interface SubtitleOptions {
    path: string;
    color?: string;
}

interface MergeOptions {
    subtitle1: SubtitleOptions;
    subtitle2: SubtitleOptions;
    outputPath: string;
    preserveFormatting?: boolean;
}

interface SubtitleTrack {
    id: number;
    type: string;
    codec: string;
    language?: string;
    trackName?: string;
    default?: boolean;
    forced?: boolean;
}

interface MkvMergeOutput {
    tracks: Array<{
        id: number;
        type: string;
        codec: string;
        properties?: {
            language?: string;
            track_name?: string;
            default_track?: boolean;
            forced_track?: boolean;
        };
    }>;
}

/**
 * Lists all subtitle tracks from a video file using mkvmerge -J command
 * @param mkvFilePath - Path to the video file
 * @returns Promise<SubtitleTrack[]> - Array of subtitle tracks
 */
export const getSubtitlesFromMkv = async (mkvFilePath: string): Promise<SubtitleTrack[]> => {
    try {
        // Check if file exists
        try {
            await fs.access(mkvFilePath);
        } catch {
            throw new Error(`File not found: ${mkvFilePath}`);
        }

        // Execute mkvmerge -J command
        const { stdout, stderr, code } = await executeCommand("mkvmerge", ["-J", mkvFilePath]);

        // Check if command executed successfully
        if (code !== 0) {
            const errorText = stderr.toString();
            throw new Error(`mkvmerge failed with code ${code}: ${errorText}`);
        }

        // Parse JSON output
        const outputText = stdout.toString();
        const data: MkvMergeOutput = JSON.parse(outputText);

        // Filter and map subtitle tracks
        return data.tracks
            .filter(track => track.type === "subtitles")
            .map(track => ({
                id: track.id,
                type: track.type,
                codec: track.codec,
                language: track.properties?.language,
                trackName: track.properties?.track_name,
                default: track.properties?.default_track ?? false,
                forced: track.properties?.forced_track ?? false,
            }));

    } catch (error) {
        if (error instanceof Error) {
            throw new Error(`Failed to list subtitles: ${error.message}`);
        }
        throw new Error(`Failed to list subtitles: ${error}`);
    }
}

/**
 * Pretty prints subtitle information to console
 * @param subtitles - Array of subtitle tracks
 */
function printSubtitles(subtitles: SubtitleTrack[]): void {
    if (subtitles.length === 0) {
        console.log("No subtitle tracks found.");
        return;
    }

    console.log(`Found ${subtitles.length} subtitle track(s):\n`);

    subtitles.forEach((sub, index) => {
        console.log(`${index + 1}. Track ID: ${sub.id} | ${sub.codec} | ${sub.language || 'Unknown'} | ${sub.trackName || 'Unnamed'} ${sub.default ? '(Default)' : ''} ${sub.forced ? '(Forced)' : ''}`);
    });
}

/**
 * Prompts user to select subtitles from the available tracks
 * @param subtitles - Array of subtitle tracks
 * @param numTracks - number of tracks to select
 * @returns Promise<SubtitleTrack[]> - Array of selected subtitle tracks (up to 2)
 */
const selectSubtitles = async (subtitles: SubtitleTrack[], numTracks: number): Promise<SubtitleTrack[]> => {
    if (subtitles.length === 0 || numTracks < 1) {
        return [];
    }

    const selectedTracks: SubtitleTrack[] = [];

    printSubtitles(subtitles);

    for (let i = 1; i <= numTracks; i++) {
        if (selectedTracks.length >= subtitles.length) break;

        console.log(`\nSelect subtitle (${i} of ${numTracks}):`);

        // Read user input
        const input = await readInput(`Enter number (1-${subtitles.length}): `, (input: string): boolean => {
            const inputNum = parseInt(input.trim());

            if (Number.isNaN(inputNum)) {
                console.log(`'${input}' is not a valid number!`);
                return false;
            }
            if (inputNum < 1 || inputNum > subtitles.length) {
                console.log(`'${inputNum}' is not within range (1-${subtitles.length})!`);
                return false;
            }

            const selectedTrack = subtitles[inputNum - 1];

            if (selectedTracks.some(track => track.id === selectedTrack.id)) {
                console.log(`'${inputNum}' was previously selected!`);
                return false;
            }

            return true;
        });

        const selectedTrack = subtitles[parseInt(input.trim()) - 1];

        console.log(`Selected: ${selectedTrack.language || 'Unknown'} - ${selectedTrack.trackName || 'Unnamed'}`);
        selectedTracks.push(selectedTrack);
    }

    return selectedTracks;
}

/**
 * Finds subtitle tracks from a full array with detailed matching results
 * @param targetTracks - Array of subtitle tracks to find
 * @param allTracks - Full array of subtitle tracks to search in
 * @returns Object containing found tracks, missing tracks, and match info
 */
function findSubtitleTracks(
    targetTracks: SubtitleTrack[],
    allTracks: SubtitleTrack[]
): {
    found: SubtitleTrack[];
    missing: SubtitleTrack[];
    foundCount: number;
    totalRequested: number;
    allFound: boolean;
} {
    const foundTracks: SubtitleTrack[] = [];
    const missingTracks: SubtitleTrack[] = [];

    for (const targetTrack of targetTracks) {
        const foundTrack = allTracks.find(track =>
            track.type === targetTrack.type &&
            track.codec === targetTrack.codec &&
            track.language === targetTrack.language &&
            track.trackName === targetTrack.trackName &&
            track.default === targetTrack.default &&
            track.forced === targetTrack.forced
        );
        if (foundTrack) {
            foundTracks.push(foundTrack);
        } else {
            missingTracks.push(targetTrack);
        }
    }

    return {
        found: foundTracks,
        missing: missingTracks,
        foundCount: foundTracks.length,
        totalRequested: targetTracks.length,
        allFound: missingTracks.length === 0
    };
}

const getSubtitleExtension = (codec: string): string => {
    let extension = '.srt'; // default
    if (codec.toLowerCase().includes('ass') || codec.toLowerCase().includes('ssa')) {
        extension = '.ass';
    } else if (codec.toLowerCase().includes('pgs') || codec.toLowerCase().includes('hdmv')) {
        extension = '.sup';
    } else if (codec.toLowerCase().includes('vobsub')) {
        extension = '.sub';
    } else if (codec.toLowerCase().includes('dvd')) {
        extension = '.sub';
    }

    return extension;
};

/**
 * Extracts selected subtitle tracks to files using mkvextract
 * @param filePath - Path to the source video file
 * @param subtitleTracks - Array of subtitle tracks to extract
 * @param outputDir - Directory to save extracted subtitle files (optional, defaults to same as video file)
 * @returns Promise<string[]> - Array of output file paths
 */
export async function extractSubtitles(
    filePath: string,
    subtitleTracks: SubtitleTrack[],
    outputDir?: string
): Promise<string[]> {
    if (subtitleTracks.length === 0) {
        throw new Error("No subtitle tracks provided for extraction");
    }

    try {
        // Check if source file exists
        try {
            await fs.access(filePath);
        } catch {
            throw new Error(`Source file not found: ${filePath}`);
        }

        // Determine output directory
        const baseDir = outputDir || process.cwd();
        const videoFileName = path.basename(filePath, path.extname(filePath));

        // Ensure output directory exists
        try {
            await fs.mkdir(baseDir, { recursive: true });
        } catch (error: any) {
            if (error.code !== 'EEXIST') {
                throw new Error(`Failed to create output directory: ${baseDir}`);
            }
        }

        const outputFiles: string[] = [];
        const extractArgs: string[] = ["tracks", filePath];

        // Build mkvextract arguments for each subtitle track
        for (let i = 0; i < subtitleTracks.length; i++) {
            const track = subtitleTracks[i];

            // Determine file extension based on codec
            const extension = getSubtitleExtension(track.codec);

            // Create output filename
            const langSuffix = track.language ? `${track.language}` : '';
            const outputFileName = `${videoFileName}.${langSuffix}${extension}`;
            const outputPath = path.join(baseDir, outputFileName);

            // Add track extraction argument: trackID:outputfile
            extractArgs.push(`${track.id}:${outputPath}`);
            outputFiles.push(outputPath);
        }

        console.log(`Extracting ${subtitleTracks.length} subtitle track(s)...`);

        // Execute mkvextract command
        const { stdout, stderr, code } = await executeCommand("mkvextract", extractArgs, true);

        if (code !== 0) {
            const errorText = stderr.toString();
            throw new Error(`mkvextract failed with code ${code}: ${errorText}`);
        }

        const outputText = stdout.toString();
        if (outputText.trim()) {
            console.log(outputText);
        }

        // Verify extracted files exist
        const verifiedFiles: string[] = [];
        for (const outputFile of outputFiles) {
            try {
                await fs.access(outputFile);
                verifiedFiles.push(outputFile);
                console.log(`✓ Extracted: ${outputFile}`);
            } catch {
                console.warn(`⚠ Warning: Expected output file not found: ${outputFile}`);
            }
        }

        if (verifiedFiles.length === 0) {
            throw new Error("No subtitle files were successfully extracted");
        }

        return verifiedFiles;

    } catch (error) {
        if (error instanceof Error) {
            throw new Error(`Failed to extract subtitles: ${error.message}`);
        }
        throw new Error(`Failed to extract subtitles: ${error}`);
    }
}


/**
 * Lists all MKV files in a specified directory
 * @param directoryPath - The path to the directory to search
 * @param recursive - Whether to search subdirectories recursively (default: false)
 * @returns Promise<string[]> - Array of file paths for MKV files
 */
const listMkvFiles = async (
    directoryPath: string,
    recursive: boolean = false
): Promise<string[]> => {
    const mkvFiles: string[] = [];

    try {
        // Check if the directory exists
        const dirInfo = await fs.stat(directoryPath);
        if (!dirInfo.isDirectory()) {
            throw new Error(`Path ${directoryPath} is not a directory`);
        }

        // Read directory entries
        const entries = await fs.readdir(directoryPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(directoryPath, entry.name);

            if (entry.isFile() && entry.name.toLowerCase().endsWith('.mkv')) {
                mkvFiles.push(fullPath);
            } else if (entry.isDirectory() && recursive) {
                // Recursively search subdirectories
                const subDirFiles = await listMkvFiles(fullPath, recursive);
                mkvFiles.push(...subDirFiles);
            }
        }

        return mkvFiles.sort(); // Sort alphabetically
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            throw new Error(`Directory not found: ${directoryPath}`);
        } else if (error.code === 'EACCES') {
            throw new Error(`Permission denied accessing: ${directoryPath}`);
        }
        throw error;
    }
}

/**
 * Merges two SRT subtitle files with different colors
 * @param options Configuration object with file paths and options
 * @throws Error if files cannot be read or parsed
 */
export const mergeSrtFiles = async (options: MergeOptions): Promise<void> => {
    const { subtitle1, subtitle2, outputPath } = options;

    // Read both subtitle files
    const subtitle1Content = await readSubtitleFileContent(subtitle1.path);
    const subtitle2Content = await readSubtitleFileContent(subtitle2.path);

    if (!subtitle1Content.trim()) {
        throw new Error(`Subtitle file is empty: ${subtitle1.path}`);
    }
    if (!subtitle2Content.trim()) {
        throw new Error(`Subtitle file is empty: ${subtitle2.path}`);
    }

    // Parse SRT content
    const subtitle1NodeList = parseSubtitles(subtitle1Content, subtitle1.color ?? "white");
    const subtitle2NodeList = parseSubtitles(subtitle2Content, subtitle2.color ?? "yellow");

    // Merge and sort subtitles by start time
    const mergedNodeList = [...subtitle1NodeList, ...subtitle2NodeList].sort((a, b) => {
        const aStart = a.type === 'cue' ? a.data.start : 0;
        const bStart = b.type === 'cue' ? b.data.start : 0;

        return aStart - bStart;
    });

    // Generate merged SRT content
    const mergedContent = stringifySync(mergedNodeList, { format: "SRT" });

    // Write to output file
    await fs.writeFile(outputPath, mergedContent, 'utf8');

    console.log(`✅ Successfully merged subtitles to: ${outputPath}`);
}

/**
 * Reads and validates a subtitle file
 */
const readSubtitleFileContent = async (filePath: string): Promise<string> => {
    try {
        return await fs.readFile(filePath, 'utf8');
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            throw new Error(`Subtitle file not found: ${filePath}`);
        }
        throw new Error(`Cannot read subtitle file ${filePath}: ${error.message}`);
    }
}

/**
 * Parses SRT content and applies color formatting
 */
const parseSubtitles = (content: string, applyColor?: string): Node[] => {
    const nodes = parseSync(content);
    return nodes.map((n): Node => {
        if (n.type === 'cue') {
            return {
                ...n,
                data: {
                    ...n.data,
                    text: applyColor ? `<font color="${applyColor}">${n.data.text}</font>` : n.data.text,
                }
            }
        } else {
            return n;
        }
    });
}

export const findSubtitlesToExtract = async (numTracks: number, targetTracks: SubtitleTrack[], mkvFileTracks: SubtitleTrack[]): Promise<SubtitleTrack[]> => {
    if (targetTracks.length < numTracks) {
        return await selectSubtitles(mkvFileTracks, numTracks);
    }

    const findResult = findSubtitleTracks(targetTracks, mkvFileTracks);

    if (!findResult.allFound) {
        console.log("Unable to find all tracks!");
        return await selectSubtitles(mkvFileTracks, numTracks);
    }

    console.log("Found same tracks to extract");
    return findResult.found;
};

const batchExtractMergeOp = async (mkvFiles: string[], workdir: string, targetTracks: SubtitleTrack[]): Promise<void> => {
    if (mkvFiles.length < 1) { return; }

    const mkvFilePath = mkvFiles[0];
    const mkvFileInfo = getFileInfo(mkvFilePath);

    const mkvFileSubtitles = await getSubtitlesFromMkv(mkvFilePath);

    const tracksToExtract = await findSubtitlesToExtract(2, targetTracks, mkvFileSubtitles);

    const outputPath = `${workdir}/${mkvFileInfo.name}.${tracksToExtract[0].language}${tracksToExtract[1].language}${getSubtitleExtension(tracksToExtract[0].codec)}`;

    if (getPathInfo(outputPath) === 'file') {
        const input = await readInput(`File '${outputPath}' already exists, skip? (y/n):`, (input) => ['y', 'n'].includes(input.trim().toLowerCase()));

        if (input.trim().toLowerCase() === 'y') {
            return batchExtractMergeOp(mkvFiles.slice(1), workdir, tracksToExtract);
        }
    }

    const extracted = await extractSubtitles(mkvFilePath, tracksToExtract, path.join(workdir, 'tracks'));

    await mergeSrtFiles({
        subtitle1: { path: extracted[0] },
        subtitle2: { path: extracted[1] },
        outputPath: outputPath,
    });

    return batchExtractMergeOp(mkvFiles.slice(1), workdir, tracksToExtract);
};

export const runBatchExtractMerge = async (workdir: string): Promise<void> => {
    return batchExtractMergeOp(await listMkvFiles(workdir), workdir, []);
}

export const shiftSubtitle = async (timeMs: number, subPath: string, outPath: string): Promise<void> => {
    const subtitleContent = await readSubtitleFileContent(subPath);

    if (!subtitleContent.trim()) {
        throw new Error(`Subtitle file is empty: ${subPath}`);
    }

    const originalSubtitles = parseSubtitles(subtitleContent);

    const shiftedSubtitles = originalSubtitles.map((node: Node): Node => {
        if (node.type === 'header') {
            return node;
        }

        return {
            ...node,
            data: {
                ...node.data,
                start: node.data.start + timeMs,
                end: node.data.end + timeMs,
            }
        }
    });

    const shiftedContent = stringifySync(shiftedSubtitles, { format: 'SRT' });

    await fs.writeFile(outPath, shiftedContent, 'utf8');

    console.log(`✅ Successfully shifted subtitle, written to: ${outPath}`);
};
