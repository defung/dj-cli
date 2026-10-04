import { CommandHandler } from "../../../types/command";
import { Command } from "@commander-js/extra-typings";
import path from "path";
import { executeCommand } from "../../../actions/proc";
import { addSyncOptions, parseSyncOptions, SyncCLIOptions, buildSyncArgs } from "./syncOptions";

export class SyncCommand implements CommandHandler {
    name = 'sync';
    description = 'Retime a target subtitle to match a reference subtitle';

    setup(program: Command): void {
        const cmd = program
            .command(this.name)
            .description(this.description)
            .argument('<ref>', 'Reference subtitle file (correct timing)')
            .argument('<target>', 'Target subtitle file (correct text, wrong timing)')
            .argument('[out]', 'Output file path');

        addSyncOptions(cmd as unknown as import('commander').Command)
            .action(async (ref, target, out, options: SyncCLIOptions) => {
                const parsed = parseSyncOptions(options);
                const outPath = out ?? `${target}.synced.srt`;

                if (outPath === ref || outPath === target) {
                    throw new Error('Output path cannot be the same as reference or target input.');
                }

                const args = buildSyncArgs(
                    path.resolve(ref),
                    path.resolve(target),
                    path.resolve(outPath),
                    parsed,
                );

                const { code, stderr } = await executeCommand('lapse', args, true);
                if (code !== 0) {
                    const message = stderr.toString().trim() || `lapse exited with code ${code}`;
                    throw new Error(message);
                }
            });
    }
}
