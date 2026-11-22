import { CommandHandler } from "../../../types/command";
import { Command } from "@commander-js/extra-typings";
import { convertSubtitle } from "../../../actions/subtitleConvert";

export class ConvertCommand implements CommandHandler {
    name = 'convert';
    description = 'Convert a subtitle file from one format to another (e.g. ass <-> srt)';

    setup(program: Command): void {
        program
            .command(this.name)
            .description(this.description)
            .argument('<input>', 'Path to input subtitle file')
            .argument('<output>', 'Path to output subtitle file')
            .action(async (inputPath: string, outputPath: string) => {
                await convertSubtitle(inputPath, outputPath);
                console.log(`✅ Converted subtitle to: ${outputPath}`);
            });
    }
}
