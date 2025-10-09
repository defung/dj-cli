import {spawn} from "child_process";
import {createInterface} from "readline";
import {ParsedPath} from "node:path";
import path from "path";

/**
 * Executes a command and returns stdout, stderr, and exit code
 */
export async function executeCommand(command: string, args: string[]): Promise<{stdout: Buffer, stderr: Buffer, code: number}> {
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

export const readInput = async (question: string, validator?: (input: string) => boolean): Promise<string> => {
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout
    });

    let input: string = '';
    let firstRun = true;

    do {
        if (!firstRun) {
            console.log("Invalid input!");
        }

        input = await new Promise<string>((resolve) => {
            rl.question(question, (answer) => {
                rl.close();
                resolve(answer);
            });
        });

        firstRun = false;
    } while (!validator || validator(input));

    return input;
}

export const getFileInfo = (filePath: string): ParsedPath => {
    const fileNameWithExtension = path.basename(filePath);
    return path.parse(fileNameWithExtension);
}