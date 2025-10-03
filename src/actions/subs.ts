#!/usr/bin/env node
import { parse, build } from "subsrt-ts";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import { createReadStream } from "fs";
import { createInterface } from "readline";
import path from "path";
import { promisify } from "util";
import {Caption} from "subsrt-ts/dist/types/handler";

/**
 * Executes a command and returns stdout, stderr, and exit code
 */
async function executeCommand(command: string, args: string[]): Promise<{stdout: Buffer, stderr: Buffer, code: number}> {
    return new Promise((resolve, reject) => {
        const process = spawn(command, args);
        let stdout = Buffer.alloc(0);
        let stderr = Buffer.alloc(0);
        
        process.stdout.on('data', (data) => {
            stdout = Buffer.concat([stdout, data]);
        });
        
        process.stderr.on('data', (data) => {
            stderr = Buffer.concat([stderr, data]);
        });
        
        process.on('close', (code) => {
            resolve({ stdout, stderr, code: code || 0 });
        });
        
        process.on('error', reject);
    });
}

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
        const subtitleTracks: SubtitleTrack[] = data.tracks
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

        return subtitleTracks;

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

    for (let i = 1; i <= 2; i++) {
        if (selectedTracks.length >= subtitles.length) break;

        console.log(`\nSelect subtitle ${i} (or press Enter to skip):`);

        // Read user input
        const rl = createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const input = await new Promise<string>((resolve) => {
            rl.question(`Enter number (1-${subtitles.length}): `, (answer) => {
                rl.close();
                resolve(answer);
            });
        });

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
            let extension = '.srt'; // default
            if (track.codec.toLowerCase().includes('ass') || track.codec.toLowerCase().includes('ssa')) {
                extension = '.ass';
            } else if (track.codec.toLowerCase().includes('pgs') || track.codec.toLowerCase().includes('hdmv')) {
                extension = '.sup';
            } else if (track.codec.toLowerCase().includes('vobsub')) {
                extension = '.sub';
            } else if (track.codec.toLowerCase().includes('dvd')) {
                extension = '.sub';
            }

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
    const { whiteSubtitlePath, yellowSubtitlePath, outputPath, preserveFormatting = true } = options;

    // Read both subtitle files
    const whiteContent = await readSubtitleFile(whiteSubtitlePath);
    const yellowContent = await readSubtitleFile(yellowSubtitlePath);

    // Parse SRT content
    const whiteSubtitles = parseSubtitles(whiteContent, "white");
    const yellowSubtitles = parseSubtitles(yellowContent, "yellow");

    // Merge and sort subtitles by start time
    const mergedSubtitles = [...whiteSubtitles, ...yellowSubtitles].sort((a, b) => {
        const aStart = a.type === 'caption' ? a.start : 0;
        const bStart = b.type === 'caption' ? b.start : 0;

        return aStart - bStart;
    });

    // Generate merged SRT content
    const mergedContent = build(mergedSubtitles, { format: "srt" });

    // Write to output file
    await fs.writeFile(outputPath, mergedContent, 'utf8');

    console.log(`✅ Successfully merged subtitles to: ${outputPath}`);
    console.log(`📊 Total subtitles: ${mergedContent.length} (${whiteSubtitles.length} white + ${yellowSubtitles.length} yellow)`);
}

/**
 * Reads and validates a subtitle file
 */
async function readSubtitleFile(filePath: string): Promise<string> {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        if (!content.trim()) {
            throw new Error(`Subtitle file is empty: ${filePath}`);
        }
        return content;
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
function parseSubtitles(content: string, color: "white" | "yellow"): Caption[] {
    const parsed = parse(content);

    return parsed.map(entry => {
        if (entry.type === 'caption') {
            return {
                ...entry,
                text: applyColorFormatting(entry.text, color)
            }
        }

        return entry;
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

/**
 * Converts SRT time format to milliseconds for sorting
 */
function timeToMilliseconds(timeStr: string): number {
    try {
        // SRT format: HH:MM:SS,mmm
        const [time, ms] = timeStr.split(',');
        const [hours, minutes, seconds] = time.split(':').map(Number);

        return (hours * 3600 + minutes * 60 + seconds) * 1000 + parseInt(ms || '0');
    } catch (error) {
        throw new Error(`Invalid time format: ${timeStr}`);
    }
}

/**
 * Merges two subtitle file paths by combining their language codes into a single output path.
 *
 * @param path1 - First subtitle file path (e.g., "/mnt/test/tracks/movie.chi.srt")
 * @param path2 - Second subtitle file path (e.g., "/mnt/test/tracks/movie.eng.srt")
 * @param outputPath - Directory path for the merged file (e.g., "/mnt/output")
 * @returns Merged file path with combined language codes (e.g., "/mnt/output/movie.chieng.srt")
 *
 * @example
 * calculateOutputFile(
 *   "/mnt/test/tracks/movie.chi.srt",
 *   "/mnt/test/tracks/movie.eng.srt",
 *   "/mnt/output"
 * )
 * // Returns: "/mnt/output/movie.chieng.srt"
 */
const calculateOutputFile = (path1: string, path2: string, outputPath: string): string => {
    // Extract directory and filename parts
    const getPathParts = (fullPath: string) => {
        const lastSlash = fullPath.lastIndexOf('/');
        const directory = fullPath.substring(0, lastSlash + 1);
        const filename = fullPath.substring(lastSlash + 1);
        return { directory, filename };
    };

    // Extract language code from filename (assumes format: basename.lang.ext)
    const extractLanguageCode = (filename: string): { baseName: string; langCode: string; extension: string } => {
        const parts = filename.split('.');
        if (parts.length < 3) {
            throw new Error(`Invalid filename format: ${filename}`);
        }

        const extension = parts[parts.length - 1];
        const langCode = parts[parts.length - 2];
        const baseName = parts.slice(0, -2).join('.');

        return { baseName, langCode, extension };
    };

    const { directory: dir1, filename: filename1 } = getPathParts(path1);
    const { directory: dir2, filename: filename2 } = getPathParts(path2);

    const { baseName: baseName1, langCode: lang1, extension: ext1 } = extractLanguageCode(filename1);
    const { baseName: baseName2, langCode: lang2, extension: ext2 } = extractLanguageCode(filename2);

    // Validate that base names and extensions match
    if (baseName1 !== baseName2) {
        throw new Error(`Base names don't match: ${baseName1} vs ${baseName2}`);
    }
    if (ext1 !== ext2) {
        throw new Error(`Extensions don't match: ${ext1} vs ${ext2}`);
    }

    // Combine language codes and create new filename
    const combinedLangCode = lang1 + lang2;
    const newFilename = `${baseName1}.${combinedLangCode}.${ext1}`;

    return path.join(outputPath, newFilename);
};

export const runBatchExtractMerge = async (workdir: string): Promise<void> => {
    const mkvFiles = await listMkvFiles(workdir);

    let selectedSubtitles: SubtitleTrack[] = [];

    for (const mkvFile of mkvFiles) {
        console.log(`Processing '${mkvFile}'...`);

        const subtitles = await listSubtitles(mkvFile);
        let subtitlesToExtract: SubtitleTrack[] = [];

        if (selectedSubtitles.length === 2) {
            const findResult = findSubtitleTracks(selectedSubtitles, subtitles);
            if (findResult.allFound) {
                subtitlesToExtract = findResult.found;
            } else {
                console.log("Unable to find all tracks!");
            }
        }

        if (subtitlesToExtract.length === 2) {
            console.log("Found same tracks to extract...");
        } else {
            printSubtitles(subtitles);
            selectedSubtitles = await selectSubtitles(subtitles);
            subtitlesToExtract = [...selectedSubtitles];
        }

        const extracted = await extractSubtitles(mkvFile, subtitlesToExtract, path.join(workdir, 'tracks'));
        const outputPath = calculateOutputFile(extracted[0], extracted[1], workdir);

        await mergeSrtFiles({
            whiteSubtitlePath: extracted[0],
            yellowSubtitlePath: extracted[1],
            outputPath: outputPath,
            preserveFormatting: true
        });
    }
}
