import { safeStorage } from 'electron';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { CredentialStore, SavedState } from '../server/account-service';

export function encryptedStore<T = SavedState>(path: string, label = '账号'): Omit<CredentialStore, 'save'> & { save(state: T): Promise<void> } {
  const requireEncryption = () => {
    if (!safeStorage.isEncryptionAvailable() || (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')) throw new Error(`系统安全存储不可用；未以明文保存${label}，请解锁系统钥匙串后重试。`);
  };
  return {
    kind: 'encrypted',
    async load() {
      let bytes: Buffer;
      try { bytes = await readFile(path); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw new Error(`无法读取${label}存储；原文件未修改。`); }
      requireEncryption();
      try { return JSON.parse(safeStorage.decryptString(bytes)) as unknown; }
      catch { throw new Error(`无法解密${label}存储，请检查系统钥匙串权限；原文件未修改。`); }
    },
    async save(state) {
      requireEncryption();
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      const temp = `${path}.tmp`;
      await writeFile(temp, safeStorage.encryptString(JSON.stringify(state)), { mode: 0o600 });
      await rename(temp, path);
    },
  };
}
