import {CommandHandler} from "../../../types/command";
import {Command} from "@commander-js/extra-typings";
import {
    extractSubtitles,
    findSubtitlesToExtract,
    getSubtitlesFromMkv,
} from "../../../actions/subs";

export class ExtractCommand implements CommandHandler {
    name = 'extract';
    description = 'Extract subtitle from an MKV file';

    setup(program: Command): void {
        program
            .command(this.name)
            .description(this.description)
            .argument('<mkvFilePath>', 'Path to an MKV file')
            .argument('<outPath>', 'Path to output file')
            .action(async (mkvFilePath: string, outPath: string) => {
                const mkvFileSubtitles = await getSubtitlesFromMkv(mkvFilePath);
                const tracksToExtract = await findSubtitlesToExtract(1, [], mkvFileSubtitles);
                await extractSubtitles(mkvFilePath, tracksToExtract, outPath);
            });
    }
}
