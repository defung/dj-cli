import { Command } from '@commander-js/extra-typings';
import { CommandHandler } from '../../../types/command';
import {banksync} from "../../../actions/actual";
import {getActualConfig} from "../index";

export class BanksyncCommand implements CommandHandler {
    name = 'banksync';
    description = 'Perform bank sync against all accounts';

    setup(program: Command): void {
        program
            .command(this.name)
            .description(this.description)
            .action(async (_, cmd) => {
                const actualConfig = await getActualConfig(cmd.parent?.opts());

                await banksync(actualConfig);
            });
    }
}
