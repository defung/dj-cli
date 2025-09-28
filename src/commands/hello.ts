import { Command } from "commander";
import { CommandHandler } from "../types/command.js";

export class HelloCommand implements CommandHandler {
  name = "hello";
  description = "Say hello to someone";

  setup(program: Command): void {
    program
      .command(this.name)
      .description(this.description)
      .argument("<name>", "Name to greet")
      .action((name: string) => {
        if (!name.trim()) {
          console.error("Error: Name cannot be empty");
          process.exit(1);
        }
        console.log(`Hello ${name.trim()}`);
      });
  }
}
