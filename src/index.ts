import { Command } from 'commander';
import { CommandRegistry } from './registry/commandRegistry';
import * as packageJson from '../package.json';

function createProgram(): Command {
    const program = new Command();

    program
        .name(packageJson.cliFileName)
        .description('A CLI application for running commands')
        .version(packageJson.version);

    // Register all commands
    const registry = new CommandRegistry();
    registry.setupCommands(program);

    return program;
}

async function main(): Promise<void> {
    try {
        const program = createProgram();
        await program.parseAsync(process.argv);
    } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
    }
}

main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
});
