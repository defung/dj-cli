import {spawn} from "child_process";
import {createInterface} from "readline";

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

export const readInput = async (question: string): Promise<string> => {
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return await new Promise<string>((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}