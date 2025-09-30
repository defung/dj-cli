import { Command } from 'commander';
import { CommandHandler } from '../../../types/command';
import api from '@actual-app/api';
import {APIAccountEntity} from "@actual-app/api/@types/loot-core/src/server/api-models";
import { promises as fs, existsSync, statSync } from 'fs';
import {ActualOptions} from "../index";

const ensureEmptyDirectory = async (dirPath: string): Promise<void> => {
    // Check if path exists
    if (!existsSync(dirPath)) {
        // Directory doesn't exist, create it

        await fs.mkdir(dirPath, { recursive: true });
        console.log(`Directory created: ${dirPath}`);
        return;
    }

    // Path exists, verify it's a directory
    const stats = statSync(dirPath);

    if (!stats.isDirectory()) {
        throw new Error(`Path exists but is not a directory: ${dirPath}`);
    }

    // Directory exists, empty it
    await fs.rm(dirPath, { recursive: true, force: true });
    await fs.mkdir(dirPath, { recursive: true });

    console.log(`Directory emptied: ${dirPath}`);
};

export class BanksyncCommand implements CommandHandler {
    name = 'banksync';
    description = 'Perform bank sync against all accounts';

    setup(program: Command): void {
        program
            .command(this.name)
            .description(this.description)
            .action(async (_: any, cmd: Command) => {
                const options = cmd.parent?.opts<Record<ActualOptions, string>>();

                if (!options) {
                    throw new Error('Missing required options!');
                }

                await ensureEmptyDirectory(options.dataDir);

                await api.init({
                    dataDir: options.dataDir,
                    serverURL: options.serverURL,
                    password: options.password,
                });

                await api.downloadBudget(options.syncID, { password: options.password });

                const accounts: APIAccountEntity[] = await api.getAccounts();
                await Promise.all(accounts.map((a) => api.runBankSync({ accountId: a.id })));

                await api.shutdown();
            });
    }
}
