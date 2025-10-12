import {CommandHandler} from "../../../types/command";
import {Command} from "commander";
import {shiftSubtitle} from "../../../actions/subs";

export class ShiftCommand implements CommandHandler {
    name = 'shift';
    description = 'Shift all timestamps in a subtitle';

    setup(program: Command): void {
        program
            .command(this.name)
            .description(this.description)
            .argument('<timeMs>', 'Time in milliseconds to shift (+ to delay, - to speed up)')
            .argument('<subPath>', 'Path to subtitle file')
            .argument('<outPath>', 'Path to output file')
            .action(async (timeMsStr: string, subPath: string, outPath: string) => {
                const timeMs = parseInt(timeMsStr, 10);

                if (isNaN(timeMs)) {
                    console.error('Invalid time value. Please provide a valid integer.');
                    return;
                }

                if (timeMs === 0) {
                    console.error('Time value cannot be zero.');
                    return;
                }

                await shiftSubtitle(timeMs, subPath, outPath);
            });
    }
}
