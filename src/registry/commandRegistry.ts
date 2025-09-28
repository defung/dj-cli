import { Command } from "commander";
import { CommandHandler } from "../types/command.js";
import { HelloCommand } from "../commands/hello.js";
import { GoodbyeCommand } from "../commands/goodbye.js";

export class CommandRegistry {
  private commands: CommandHandler[] = [];

  constructor() {
    // Register all available commands here
    this.registerCommand(new HelloCommand());
    this.registerCommand(new GoodbyeCommand());
  }

  private registerCommand(command: CommandHandler): void {
    this.commands.push(command);
  }

  setupCommands(program: Command): void {
    this.commands.forEach((command) => {
      command.setup(program);
    });
  }

  getCommands(): readonly CommandHandler[] {
    return [...this.commands];
  }
}
