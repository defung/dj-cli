import {CommandHandler} from "../../../types/command";
import {Command} from "@commander-js/extra-typings";
import {runBatchExtractMerge} from "../../../actions/subs";

export class BatchExtractMergeCommand implements CommandHandler {
    name = 'bem';
    description = 'Batch Extract Merge';

    setup(program: Command): void {
        program
            .command(this.name)
            .description(this.description)
            .argument('<path>', 'Path of the directory containing MKV files')
            .action(async (path: string) => {
                return await runBatchExtractMerge(path);
            });
    }
}
