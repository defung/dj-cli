import {Command} from '@commander-js/extra-typings';
import {CommandHandler, CommandOption} from '../../types/command';
import {BanksyncCommand} from "./subcommands/banksync";
import os from 'os';
import {CommandRegistry} from "../../registry/commandRegistry";
import {StatementsyncCommand} from "./subcommands/statementsync";

const actualOptions = {
    serverURL: {
        flags: '-s, --serverURL <serverURL>',
        description: 'URL of actual server',
        required: true,
    } as CommandOption,
    syncID: {
        flags: '-i, --syncID <syncID>',
        description: 'syncID of the actual server',
        required: true
    } as CommandOption,
    password: {
        flags: '-p, --password <password>',
        description: 'password of the actual server',
        required: true
    } as CommandOption,
    dataDir: {
        flags: '-d, --dataDir <dataDir>',
        description: 'directory to store data',
        required: false,
        default: `${os.homedir()}/actual-${new Date().getTime()}`,
    } as CommandOption,
} as const;

export type ActualOptions = Record<keyof typeof actualOptions, string>;

const subCommandRegistry = new CommandRegistry(
    new BanksyncCommand(),
    new StatementsyncCommand(),
);

export class ActualCommand implements CommandHandler {
    name = 'actual';
    description = 'Perform actions against an actual instance';

    setup(program: Command): void {
        const actualCommand = program
            .command(this.name)
            .description(this.description)

        // options
        Object.values(actualOptions).forEach((option) => {
            if (option.required) {
                actualCommand.requiredOption(option.flags, option.description);
            } else {
                actualCommand.option(option.flags, option.description, option.default);
            }
        })

        subCommandRegistry.setupCommands(actualCommand);
    }
}