import {Command, OptionValues} from '@commander-js/extra-typings';
import {CommandHandler, CommandOption} from '../../types/command';
import {BanksyncCommand} from "./subcommands/banksync";
import os from 'os';
import {CommandRegistry} from "../../registry/commandRegistry";
import {StatementsyncCommand} from "./subcommands/statementsync";
import {getInfisicalSecrets} from "../../actions/infisical";

const INFISICAL_INFO = {
    projectId: '45ff8460-b359-4d91-824a-acc3c4f6def2',
}

export interface ActualConfig {
    serverURL: string;
    syncID: string;
    password: string;
    dataDir: string;
}

export interface ActualCmdOptions extends ActualConfig{
    infisicalSecretsFile?: string;
}

const actualCmdOptions: Record<keyof ActualCmdOptions, CommandOption> = {
    serverURL: {
        flags: '-s, --serverURL <serverURL>',
        description: 'URL of actual server',
        required: false,
    },
    syncID: {
        flags: '-i, --syncID <syncID>',
        description: 'syncID of the actual server',
        required: false
    },
    password: {
        flags: '-p, --password <password>',
        description: 'password of the actual server',
        required: false
    },
    dataDir: {
        flags: '-d, --dataDir <dataDir>',
        description: 'directory to store data',
        required: false,
        default: `${os.homedir()}/actual-${new Date().getTime()}`,
    },
    infisicalSecretsFile: {
        flags: '-f, --infisical-secrets-file <infisicalSecretsFile>',
        description: 'path to infisical secrets JSON file',
        required: false,
    },
} as const;

const isValidActualConfig = (obj: Record<string, any>): obj is ActualConfig => {
    return !!obj.serverURL && !!obj.syncID && !!obj.password && !!obj.dataDir;
}

// get config from either options or infisical
export const getActualConfig = async (cmdOptionValues?: OptionValues): Promise<ActualConfig> => {
    if (cmdOptionValues?.infisicalSecretsFile && typeof cmdOptionValues.infisicalSecretsFile === 'string' && typeof cmdOptionValues.dataDir === 'string') {
        const obj = await getInfisicalSecrets(cmdOptionValues.infisicalSecretsFile, INFISICAL_INFO.projectId);

        return {
            serverURL: obj['ACTUAL_SERVER_URL'],
            syncID: obj['ACTUAL_SYNC_ID'],
            password: obj['ACTUAL_PASSWORD'],
            dataDir: cmdOptionValues.dataDir,
        }
    } else if (cmdOptionValues && isValidActualConfig(cmdOptionValues)) {
        return {
            serverURL: cmdOptionValues.serverURL,
            syncID: cmdOptionValues.syncID,
            password: cmdOptionValues.password,
            dataDir: cmdOptionValues.dataDir,
        };
    }

    throw new Error(`Missing required options! (${JSON.stringify(cmdOptionValues)})`);
};

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
        Object.values(actualCmdOptions).forEach((option) => {
            if (option.required) {
                actualCommand.requiredOption(option.flags, option.description);
            } else {
                actualCommand.option(option.flags, option.description, option.default);
            }
        })

        subCommandRegistry.setupCommands(actualCommand);
    }
}