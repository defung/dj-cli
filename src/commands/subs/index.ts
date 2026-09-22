import {Command} from '@commander-js/extra-typings';
import {CommandHandler} from '../../types/command';
import {CommandRegistry} from "../../registry/commandRegistry";
import {BatchExtractMergeCommand} from "./subcommands/batchExtractMerge";
import {MergeCommand} from "./subcommands/merge";
import {ExtractCommand} from "./subcommands/extract";
import {ShiftCommand} from "./subcommands/shift";
import {SyncCommand} from "./subcommands/sync";
import {SyncBatchCommand} from "./subcommands/syncBatch";

const subCommandRegistry = new CommandRegistry(
    new ExtractCommand(),
    new MergeCommand(),
    new ShiftCommand(),
    new BatchExtractMergeCommand(),
    new SyncCommand(),
    new SyncBatchCommand(),
);

export class SubsCommand implements CommandHandler {
    name = 'subs';
    description = 'Subtitle operations';

    setup(program: Command): void {
        const subsCommand = program
            .command(this.name)
            .description(this.description)

        subCommandRegistry.setupCommands(subsCommand);
    }
}