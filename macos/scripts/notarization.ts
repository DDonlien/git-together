import { execFile } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const configurationPath = join(homedir(), '.config/gittogether/release/notary.json');
interface NotaryConfiguration { version: 1; profile: string; keychain?: string }

async function configuration(): Promise<NotaryConfiguration> {
  let saved: unknown;
  try { saved = JSON.parse(await readFile(configurationPath, 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (saved !== undefined) {
    const value = saved as Partial<NotaryConfiguration> | null;
    if (!value || value.version !== 1 || typeof value.profile !== 'string' || !value.profile.trim()
      || (value.keychain !== undefined && (typeof value.keychain !== 'string' || !isAbsolute(value.keychain)))
      || Object.keys(value).some(key => !['version', 'profile', 'keychain'].includes(key))) {
      throw new Error('仓库外公证配置格式无效；只允许profile及可选钥匙串路径，不能存放密码。');
    }
    const info = await stat(configurationPath);
    if (!info.isFile() || (info.mode & 0o077)) throw new Error('公证配置必须是仅当前用户可读的文件。');
  }
  // An explicit profile must not inherit a different profile's file-based store.
  const selected: NotaryConfiguration = process.env.GITTOGETHER_NOTARY_PROFILE !== undefined
    ? { version: 1 as const, profile: process.env.GITTOGETHER_NOTARY_PROFILE }
    : (saved as NotaryConfiguration | undefined) ?? { version: 1 as const, profile: 'gittogether-notary' };
  const keychain = process.env.GITTOGETHER_NOTARY_KEYCHAIN ?? selected.keychain;
  if (!selected.profile.trim() || (keychain && !isAbsolute(keychain))) throw new Error('公证profile或钥匙串路径无效。');
  return { version: 1, profile: selected.profile, ...(keychain ? { keychain } : {}) };
}

export async function prepareNotarization() {
  const selected = await configuration();
  const credentials = ['--keychain-profile', selected.profile, ...(selected.keychain ? ['--keychain', selected.keychain] : [])];
  const storage = selected.keychain ? 'file-keychain' : 'data-protection-keychain';
  // Only retry the observed failure before credentials have loaded. Invalid
  // credentials, upload errors and failed submissions must keep their own error.
  const timeout = 10 * 60 * 1000;
  async function run(phase: 'history' | 'submit', args: string[]) {
    const deadline = Date.now() + timeout;
    for (let attempt = 1; ; attempt++) {
      try {
        if (selected.keychain) {
          const helper = fileURLToPath(new URL('./notary-keychain-status.swift', import.meta.url));
          const status = JSON.parse((await execute('/usr/bin/swift', [helper, selected.keychain])).stdout) as { unlocked: boolean };
          if (!status.unlocked) throw Object.assign(new Error('文件型公证钥匙串暂不可读。'), { name: 'NotaryKeychainLocked' });
        }
        const result = await execute('/usr/bin/xcrun', ['notarytool', phase, ...args, ...credentials, '--output-format', 'json'], { maxBuffer: 1024 * 1024 });
        console.log(JSON.stringify({ event: 'notary.credentials.ready', phase, profile: selected.profile, storage, attempt }));
        return result.stdout;
      } catch (error) {
        const failure = error as Error & { code?: number; stdout?: string; stderr?: string };
        const unavailable = failure.name === 'NotaryKeychainLocked'
          || (failure.code === 69 && /No Keychain password item found for profile:/.test(failure.stderr ?? ''));
        if (!unavailable) {
          console.error(JSON.stringify({ event: 'notary.failed', phase, profile: selected.profile, storage, exitCode: failure.code }));
          throw error;
        }
        console.warn(JSON.stringify({ event: 'notary.credentials.unavailable', phase, profile: selected.profile, storage, attempt, reason: failure.name === 'NotaryKeychainLocked' ? 'keychain-locked' : 'item-unavailable' }));
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error(`既有Apple公证配置当前不可读（${selected.profile}，${storage}）。自动重试已超时，发布流程保留原配置，安装包未发布。`, { cause: error });
        await delay(Math.min(15_000, remaining));
      }
    }
  }
  await run('history', []);
  if (process.env.GITTOGETHER_NOTARY_PROFILE === undefined && process.env.GITTOGETHER_NOTARY_KEYCHAIN === undefined) {
    // Persist only the proven locator; passwords remain inside Apple's Keychain.
    await mkdir(dirname(configurationPath), { recursive: true, mode: 0o700 });
    await writeFile(configurationPath, JSON.stringify(selected, null, 2) + '\n', { mode: 0o600 });
  }
  return { profile: selected.profile, storage, submit: (zipPath: string) => run('submit', [zipPath, '--wait']) };
}
