import { Command } from "commander";

export interface CommandHandler {
  name: string;
  description: string;
  setup(program: Command): void;
}

interface BaseCommandOption {
  flags: string;
  description: string;
}

interface RequiredCommandOption extends BaseCommandOption {
  required: true;
}

interface OptionalCommandOption extends BaseCommandOption {
  required: false;
  default?: string;
}

export type CommandOption = RequiredCommandOption | OptionalCommandOption;