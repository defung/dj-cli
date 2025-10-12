import { Command } from '@commander-js/extra-typings';
import { CommandHandler } from '../../../types/command';
import {ActualOptions} from "../index";
import {banksync} from "../../../actions/actual";

export class BanksyncCommand implements CommandHandler {
    name = 'banksync';
    description = 'Perform bank sync against all accounts';

    setup(program: Command): void {
        program
            .command(this.name)
            .description(this.description)
            .action(async (_: any, cmd: Command) => {
                const options = cmd.parent?.opts();

                if (!options) {
                    throw new Error('Missing required options!');
                }

                await banksync({
                    serverURL: options.serverURL as string,
                    password: options.password as string,
                    syncID: options.syncID as string,
                    dataDir: options.dataDir as string,
                })
            });
    }
}
