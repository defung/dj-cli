import {Command} from 'commander';
import {CommandHandler} from '../../types/command';
import {CommandRegistry} from "../../registry/commandRegistry";
import {BatchExtractMergeCommand} from "./subcommands/batchExtractMerge";
import {MergeCommand} from "./subcommands/merge";
import {ExtractCommand} from "./subcommands/extract";

const subCommandRegistry = new CommandRegistry(
    new ExtractCommand(),
    new MergeCommand(),
    new BatchExtractMergeCommand(),
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