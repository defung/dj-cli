import { Command } from 'commander';
import { CommandHandler } from '../types/command';
import { ActualCommand } from "../commands/actual";

export class CommandRegistry {
  private commands: CommandHandler[] = [];

  constructor() {
    // Register all available commands here
    this.registerCommand(new ActualCommand());
  }

  private registerCommand(command: CommandHandler): void {
    this.commands.push(command);
  }

  setupCommands(program: Command): void {
    this.commands.forEach(command => {
      command.setup(program);
    });
  }

  getCommands(): readonly CommandHandler[] {
    return [...this.commands];
  }
}