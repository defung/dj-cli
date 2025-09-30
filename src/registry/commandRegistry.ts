import { Command } from 'commander';
import { CommandHandler } from '../types/command';
import { ActualCommand } from "../commands/actual";

export class CommandRegistry {
  private readonly commands: CommandHandler[];

  constructor(...commands: CommandHandler[]) {
    this.commands = commands;
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