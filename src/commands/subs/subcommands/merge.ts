import {CommandHandler} from "../../../types/command";
import {Command} from "@commander-js/extra-typings";
import {mergeSrtFiles, runBatchExtractMerge} from "../../../actions/subs";

export class MergeCommand implements CommandHandler {
    name = 'merge';
    description = 'Merge 2 subtitles';

    setup(program: Command): void {
        program
            .command(this.name)
            .description(this.description)
            .argument('<sub1File>', 'Path to first subtitle file (default=white)')
            .argument('<sub2File>', 'Path to second subtitle file (default=yellow)')
            .argument('<outFile>', 'Path to output file')
            .option('--color1 <color>', 'color of sub1 after merging (default=white)')
            .option('--color2 <color>', 'color of sub2 after merging (default=yellow)')
            .action(async (sub1File: string, sub2File: string, outFile: string, options) => {
                const { color1, color2 } = options;
                await mergeSrtFiles({
                    subtitle1: { path: sub1File, color: color1 },
                    subtitle2: { path: sub2File, color: color2 },
                    outputPath: outFile,
                });
            });
    }
}
