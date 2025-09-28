import { Command } from 'commander';
import { CommandHandler } from '../types/command';

export class GoodbyeCommand implements CommandHandler {
    name = 'goodbye';
    description = 'Say goodbye to someone';

    setup(program: Command): void {
        program
            .command(this.name)
            .description(this.description)
            .argument('<n>', 'Name to say goodbye to')
            .action((name: string) => {
                if (!name.trim()) {
                    console.error('Error: Name cannot be empty');
                    process.exit(1);
                }
                console.log(`Goodbye ${name.trim()}`);
            });
    }
}