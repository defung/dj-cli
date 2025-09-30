import * as api from "@actual-app/api";
import {APIAccountEntity} from "@actual-app/api/@types/loot-core/src/server/api-models";
import {ensureEmptyDirectory} from "./files";

export const banksync = async ({ dataDir, serverURL, password, syncID }: { dataDir: string; serverURL: string; password: string; syncID: string }): Promise<void> => {
    await ensureEmptyDirectory(dataDir);

    await api.init({
        dataDir: dataDir,
        serverURL: serverURL,
        password: password,
    });

    await api.downloadBudget(syncID, { password: password });

    const accounts: APIAccountEntity[] = await api.getAccounts();
    await Promise.all(accounts.map((a) => api.runBankSync({ accountId: a.id })));

    await api.shutdown();
}