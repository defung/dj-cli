import { promises as fs } from "fs";
import path from "path";
import {executeCommand, readInput} from "./proc";
import { parseSync, stringifySync, Node } from 'subtitle'
import {ParsedPath} from "node:path";

interface MergeOptions {
    whiteSubtitlePath: string;
    yellowSubtitlePath: string;
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
 * @param filePath - Path to the video file
 * @returns Promise<SubtitleTrack[]> - Array of subtitle tracks
 */
export async function listSubtitles(filePath: string): Promise<SubtitleTrack[]> {
    try {
        // Check if file exists
        try {
            await fs.access(filePath);
        } catch {
            throw new Error(`File not found: ${filePath}`);
        }

        // Execute mkvmerge -J command
        const { stdout, stderr, code } = await executeCommand("mkvmerge", ["-J", filePath]);

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
export function printSubtitles(subtitles: SubtitleTrack[]): void {
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
 * @returns Promise<SubtitleTrack[]> - Array of selected subtitle tracks (up to 2)
 */
export async function selectSubtitles(subtitles: SubtitleTrack[]): Promise<SubtitleTrack[]> {
    if (subtitles.length === 0) {
        return [];
    }

    const selectedTracks: SubtitleTrack[] = [];

    printSubtitles(subtitles);

    for (let i = 1; i <= 2; i++) {
        if (selectedTracks.length >= subtitles.length) break;

        console.log(`\nSelect subtitle ${i}:`);

        // Read user input
        const input = await readInput(`Enter number (1-${subtitles.length}): `);

        if (!input || input.trim() === '') {
            if (i === 1) {
                console.log("No subtitles selected.");
                return [];
            }
            break;
        }

        const selection = parseInt(input.trim());

        if (isNaN(selection) || selection < 1 || selection > subtitles.length) {
            console.log("Invalid selection. Please enter a valid number.");
            i--; // Retry this selection
            continue;
        }

        const selectedTrack = subtitles[selection - 1];

        // Check if already selected
        if (selectedTracks.some(track => track.id === selectedTrack.id)) {
            console.log("This subtitle is already selected. Please choose a different one.");
            i--; // Retry this selection
            continue;
        }

        selectedTracks.push(selectedTrack);
        console.log(`Selected: ${selectedTrack.language || 'Unknown'} - ${selectedTrack.trackName || 'Unnamed'}`);
    }

    return selectedTracks;
}

/**
 * Finds subtitle tracks from a full array with detailed matching results
 * @param targetTracks - Array of subtitle tracks to find
 * @param allTracks - Full array of subtitle tracks to search in
 * @returns Object containing found tracks, missing tracks, and match info
 */
export function findSubtitleTracks(
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

export const getSubtitleExtension = (codec: string): string => {
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
        const { stdout, stderr, code } = await executeCommand("mkvextract", extractArgs);

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
export async function mergeSrtFiles(options: MergeOptions): Promise<void> {
    const { whiteSubtitlePath, yellowSubtitlePath, outputPath } = options;

    // Read both subtitle files
    const whiteContent = await readSubtitleFile(whiteSubtitlePath);
    const yellowContent = await readSubtitleFile(yellowSubtitlePath);

    // Parse SRT content
    const whiteSubtitles = parseSubtitles(whiteContent, "white");
    const yellowSubtitles = parseSubtitles(yellowContent, "yellow");

    // Merge and sort subtitles by start time
    const mergedSubtitles = [...whiteSubtitles, ...yellowSubtitles].sort((a, b) => {
        const aStart = a.type === 'cue' ? a.data.start : 0;
        const bStart = b.type === 'cue' ? b.data.start : 0;

        return aStart - bStart;
    });

    // Generate merged SRT content
    const mergedContent = stringifySync(mergedSubtitles, { format: "SRT" });

    // Write to output file
    await fs.writeFile(outputPath, mergedContent, 'utf8');

    console.log(`✅ Successfully merged subtitles to: ${outputPath}`);
    console.log(`📊 Total subtitles: ${mergedContent.length} (${whiteSubtitles.length} white + ${yellowSubtitles.length} yellow)`);
}

/**
 * Reads and validates a subtitle file
 */
async function readSubtitleFile(filePath: string): Promise<string> {
    let content;

    try {
        content = await fs.readFile(filePath, 'utf8');
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            throw new Error(`Subtitle file not found: ${filePath}`);
        }
        throw new Error(`Cannot read subtitle file ${filePath}: ${error.message}`);
    }

    if (!content.trim()) {
        throw new Error(`Subtitle file is empty: ${filePath}`);
    }
    return content;
}

/**
 * Parses SRT content and applies color formatting
 */
const parseSubtitles = (content: string, color: 'white' | 'yellow'): Node[] => {
    const nodes = parseSync(content);
    return nodes.map((n): Node => {
        if (n.type === 'cue') {
            return {
                ...n,
                data: {
                    ...n.data,
                    text: applyColorFormatting(n.data.text, color),
                }
            }
        } else {
            return n;
        }
    });
}

/**
 * Applies HTML color formatting to subtitle text
 */
function applyColorFormatting(text: string, color: "white" | "yellow"): string {
    if (!text.trim()) return text;

    // Preserve existing formatting by wrapping the entire text block
    const colorTag = color === "white" ? 'white' : 'yellow';
    return `<font color="${colorTag}">${text}</font>`;
}

const getFileInfo = (filePath: string): ParsedPath => {
    const fileNameWithExtension = path.basename(filePath);
    return path.parse(fileNameWithExtension);
}

const findSubtitlesToExtract = async (targetTracks: SubtitleTrack[], mkvFileTracks: SubtitleTrack[]): Promise<SubtitleTrack[]> => {
    if (targetTracks.length < 2) {
        return await selectSubtitles(mkvFileTracks);
    }

    const findResult = findSubtitleTracks(targetTracks, mkvFileTracks);

    if (findResult.allFound) {
        console.log("Found same tracks to extract");
        return findResult.found;
    } else {
        console.log("Unable to find all tracks!");
        return await selectSubtitles(mkvFileTracks);
    }
};

const batchExtractMergeOp = async (mkvFiles: string[], workdir: string, targetTracks: SubtitleTrack[]): Promise<void> => {
    if (mkvFiles.length < 1) { return; }

    const mkvFilePath = mkvFiles[0];
    const mkvFileInfo = getFileInfo(mkvFilePath);

    const mkvFileSubtitles = await listSubtitles(mkvFilePath);

    const tracksToExtract = await findSubtitlesToExtract(targetTracks, mkvFileSubtitles);

    const extracted = await extractSubtitles(mkvFilePath, tracksToExtract, path.join(mkvFileInfo.dir, 'tracks'));

    const outputPath = `${workdir}/${mkvFileInfo.name}.${tracksToExtract[0].language}${tracksToExtract[1].language}${getSubtitleExtension(tracksToExtract[0].codec)}`;

    await mergeSrtFiles({
        whiteSubtitlePath: extracted[0],
        yellowSubtitlePath: extracted[1],
        outputPath: outputPath,
    });

    return batchExtractMergeOp(mkvFiles.slice(1), workdir, tracksToExtract);
}

export const runBatchExtractMerge = async (workdir: string): Promise<void> => {
    return batchExtractMergeOp(await listMkvFiles(workdir), workdir, []);
}