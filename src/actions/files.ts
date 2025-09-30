import {existsSync, promises as fs, statSync} from "fs";

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