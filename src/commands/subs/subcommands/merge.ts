import {CommandHandler} from "../../../types/command";
import {Command} from "commander";
import {mergeSrtFiles, runBatchExtractMerge} from "../../../actions/subs";

export class MergeCommand implements CommandHandler {
    name = 'merge';
    description = 'Merge 2 subtitles';

    setup(program: Command): void {
        program
            .command(this.name)
            .description(this.description)
            .argument('<sub1File>', 'Path to first subtitle file (white)')
            .argument('<sub2File>', 'Path to second subtitle file (yellow)')
            .argument('<outFile>', 'Path to output file (yellow)')
            .action(async (sub1File: string, sub2File: string, outFile: string) => {
                await mergeSrtFiles({
                    whiteSubtitlePath: sub1File,
                    yellowSubtitlePath: sub2File,
                    outputPath: outFile,
                    preserveFormatting: true,
                });
            });
    }
}