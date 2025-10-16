import {InfisicalSDK} from "@infisical/sdk";
import {readJsonFile} from "./files";

export const getInfisicalSecrets = async (infisicalSecretsFile: string, projectId: string): Promise<{[k: string]: string}> => {
    const infisicalSecrets: Record<string, string> = readJsonFile(infisicalSecretsFile);

    const client = new InfisicalSDK({ siteUrl: infisicalSecrets.siteUrl });

    await client.auth().universalAuth.login({ clientId: infisicalSecrets.infisicalClientId, clientSecret: infisicalSecrets.infisicalClientSecret });

    const secrets = await client.secrets().listSecrets({ projectId: projectId, environment: 'prod'});

    return Object.fromEntries(secrets.secrets.map((secret) => [secret.secretKey, secret.secretValue]));
};
