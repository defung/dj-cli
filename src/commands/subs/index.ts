import {Command} from 'commander';
import {CommandHandler} from '../../types/command';
import {CommandRegistry} from "../../registry/commandRegistry";
import {BatchExtractMergeCommand} from "./subcommands/batchExtractMerge";

const subCommandRegistry = new CommandRegistry(
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