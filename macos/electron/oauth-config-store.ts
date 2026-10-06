import { encryptedStore } from './credential-store';
import { isRecord } from '../src/import-model';
import { githubDevClientId } from '../src/github-web-model';
import { validateGitHubClientSecret } from '../server/github-web-authorization';

type SavedConfiguration = { version: 1; clientId: string; secret: string };

// Separate from accounts and temporary Chromium sessions; never copied into an app.
export function oauthConfigurationStore(path: string) {
  const store = encryptedStore<SavedConfiguration>(path, '网页授权配置');
  return {
    async load(): Promise<string | null> {
      const saved = await store.load();
      if (saved === null) return null;
      if (!isRecord(saved) || saved.version !== 1 || saved.clientId !== githubDevClientId || typeof saved.secret !== 'string') {
        throw new Error('网页授权配置格式或应用身份不匹配；原文件未修改。');
      }
      validateGitHubClientSecret(saved.secret);
      return saved.secret;
    },
    async save(secret: string): Promise<void> {
      validateGitHubClientSecret(secret);
      await store.save({ version: 1, clientId: githubDevClientId, secret });
    },
  };
}
