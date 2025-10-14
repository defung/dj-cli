import { Command } from '@commander-js/extra-typings';
import { CommandHandler } from '../../../types/command';
import {ActualOptions} from "../index";
import {banksync, updateCreditCardSchedules} from "../../../actions/actual";

export class StatementsyncCommand implements CommandHandler {
    name = 'statementsync';
    description = 'Sync credit card statements and schedules';

    setup(program: Command): void {
        program
            .command(this.name)
            .description(this.description)
            .action(async (_, cmd) => {
                const options = cmd.parent?.opts() as ActualOptions;

                if (!options) {
                    throw new Error('Missing required options!');
                }

                await updateCreditCardSchedules({
                    serverURL: options.serverURL,
                    password: options.password,
                    syncID: options.syncID,
                    dataDir: options.dataDir,
                })
            });
    }
}
