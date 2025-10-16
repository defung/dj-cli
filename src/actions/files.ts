import {existsSync, promises as fs, statSync, readFileSync} from "fs";
import {ParsedPath} from "node:path";
import path from "path";

export const ensureEmptyDirectory = async (dirPath: string): Promise<void> => {
    // Check if path exists
    if (!existsSync(dirPath)) {
        // Directory doesn't exist, create it

        await fs.mkdir(dirPath, { recursive: true });
        console.log(`Directory created: ${dirPath}`);
        return;
    }

    // Path exists, verify it's a directory
    const stats = statSync(dirPath);

    if (!stats.isDirectory()) {
        throw new Error(`Path exists but is not a directory: ${dirPath}`);
    }

    // Directory exists, empty it
    await fs.rm(dirPath, { recursive: true, force: true });
    await fs.mkdir(dirPath, { recursive: true });

    console.log(`Directory emptied: ${dirPath}`);
};

export const getFileInfo = (filePath: string): ParsedPath => {
    const fileNameWithExtension = path.basename(filePath);
    return path.parse(fileNameWithExtension);
};

export const readJsonFile = (filePath: string): any => {
    const fileContent = readFileSync(filePath, 'utf8');
    return JSON.parse(fileContent);
};
