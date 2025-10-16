import { Command } from '@commander-js/extra-typings';
import { CommandHandler } from '../../../types/command';
import {getActualConfig} from "../index";
import {updateCreditCardSchedules} from "../../../actions/actual";

export class StatementsyncCommand implements CommandHandler {
    name = 'statementsync';
    description = 'Sync credit card statements and schedules';

    setup(program: Command): void {
        program
            .command(this.name)
            .description(this.description)
            .action(async (_, cmd) => {
                const actualConfig = await getActualConfig(cmd.parent?.opts());

                await updateCreditCardSchedules(actualConfig)
            });
    }
}
