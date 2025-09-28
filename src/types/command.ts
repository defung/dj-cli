import { Command } from "commander";

export interface CommandHandler {
  name: string;
  description: string;
  setup(program: Command): void;
}
