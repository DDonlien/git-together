import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, existsSync, statSync, writeFileSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';

export function classifyNotaryFailure(code, stderr, locked = false) {
  if (code === 69 && /No Keychain password item found for profile:/.test(stderr)) return locked ? 'data-protection-locked' : 'profile-temporarily-unavailable';
  if (/connectTimeout|connectionReset|abortedUpload|timed out/i.test(stderr)) return 'upload-network';
  if (/401|Invalid credentials|authentication failed/i.test(stderr)) return 'authentication-rejected';
  return 'notary-failed';
}
export function readNotaryConfiguration(path = join(homedir(), '.config/gittogether/release/notary.json'), env = process.env) {
  let saved = { version: 1, profile: 'gittogether-notary' };
  if (existsSync(path)) {
    const info = statSync(path);
    if (!info.isFile() || info.mode & 0o077) throw new Error('公证定位配置必须仅当前用户可读。');
    saved = JSON.parse(readFileSync(path, 'utf8'));
    if (!saved || saved.version !== 1 || typeof saved.profile !== 'string' || !saved.profile.trim() || Object.keys(saved).some(key => !['version', 'profile', 'keychain'].includes(key))) throw new Error('公证定位配置格式无效；禁止在配置中保存密码。');
  }
  const selected = env.GITTOGETHER_NOTARY_PROFILE !== undefined ? { version: 1, profile: env.GITTOGETHER_NOTARY_PROFILE } : saved;
  const keychain = env.GITTOGETHER_NOTARY_KEYCHAIN ?? selected.keychain;
  if (!selected.profile.trim() || keychain !== undefined && (typeof keychain !== 'string' || !isAbsolute(keychain))) throw new Error('公证profile或文件钥匙串定位无效。');
  return { version: 1, profile: selected.profile, ...(keychain ? { keychain } : {}) };
}
function lockedForProcess(pid) {
  if (!pid) return false;
  const predicate = `process == "secd" AND eventMessage CONTAINS "notarytool[${pid}]" AND eventMessage CONTAINS "keychain is locked"`;
  const result = spawnSync('/usr/bin/log', ['show', '--last', '15s', '--style', 'compact', '--predicate', predicate], { encoding: 'utf8', timeout: 20000, maxBuffer: 128 * 1024 });
  return result.status === 0 && /-25308|errSecInteractionNotAllowed/.test(result.stdout);
}
export function notarizationProgress(text) {
  const ids = [...text.matchAll(/\bid:\s*([a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})/gi)];
  const statuses = [...text.matchAll(/\bstatus:\s*(Accepted|Invalid|Rejected|In Progress)/gi)];
  return { id: ids.at(-1)?.[1], status: statuses.at(-1)?.[1], uploaded: /Successfully uploaded/i.test(text) };
}
function saveCheckpoint(path, value) {
  const temporary = path + '.tmp';
  writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  renameSync(temporary, path);
}

/** Only Apple's entitled notarytool can establish profile readability. The
 * ordinary login-keychain status or an unsigned SecItem probe cannot do so. */
export async function prepareNotarization({ retryMilliseconds = 600000 } = {}) {
  const config = readNotaryConfiguration();
  const storage = config.keychain ? 'file-keychain' : 'data-protection-keychain';
  const credentials = ['--keychain-profile', config.profile, ...(config.keychain ? ['--keychain', config.keychain] : [])];
  const manager = spawnSync('/bin/launchctl', ['managername'], { encoding: 'utf8' }).stdout?.trim();
  const userContext = manager === 'Aqua';
  async function execute(phase, args, { normal = false, onProgress } = {}) {
    const deadline = Date.now() + retryMilliseconds;
    for (let attempt = 1; ; attempt++) {
      if (config.keychain) {
        // Inspect only file-keychain lock metadata. Never request an unlock.
        const swift = 'import Foundation\nimport Security\nvar k:SecKeychain?\nguard SecKeychainOpen(CommandLine.arguments[1],&k)==errSecSuccess,let k else{exit(1)}\nvar s:SecKeychainStatus=0\nguard SecKeychainGetStatus(k,&s)==errSecSuccess,s & kSecUnlockStateStatus != 0 else{exit(2)}';
        const status = spawnSync('/usr/bin/swift', ['-e', swift, config.keychain], { timeout: 30000 });
        if (status.status !== 0) throw new Error('文件型公证钥匙串当前不可读；已保留配置，未发起解锁。');
      }
      const argv = ['notarytool', phase, ...args, ...credentials, ...(normal ? ['--no-progress'] : ['--output-format', 'json'])];
      const command = userContext ? '/usr/bin/xcrun' : '/bin/launchctl';
      const launch = userContext ? argv : ['asuser', String(process.getuid()), '/usr/bin/xcrun', ...argv];
      const result = await new Promise((done, reject) => {
        const child = spawn(command, launch, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '', stderr = '';
        child.stdout.on('data', chunk => { stdout = (stdout + chunk).slice(-4 * 1024 * 1024); if (normal) onProgress?.(notarizationProgress(stdout)); });
        child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4 * 1024 * 1024); });
        child.on('error', () => reject(new Error('Apple公证工具无法启动。')));
        child.on('close', code => done({ code, stdout, stderr, pid: child.pid }));
      });
      if (result.code === 0) return normal ? notarizationProgress(result.stdout) : JSON.parse(result.stdout);
      const unavailable = result.code === 69 && /No Keychain password item found for profile:/.test(result.stderr);
      const kind = classifyNotaryFailure(result.code, result.stderr, unavailable && !config.keychain && lockedForProcess(result.pid));
      console.warn(JSON.stringify({ event: 'notary.failed', phase, profile: config.profile, storage, context: userContext ? 'Aqua' : 'asuser', exitCode: result.code, reason: kind }));
      // Neither credentials nor raw AWS multipart credentials go into logs.
      if (!unavailable || Date.now() >= deadline) throw Object.assign(new Error(kind === 'data-protection-locked' ? '数据保护钥匙串当前锁定；原公证配置仍保留，候选与任务记录可继续使用。' : kind === 'profile-temporarily-unavailable' ? '公证配置当前不可见；不能据此判定凭据丢失，已保留配置及候选。' : kind === 'upload-network' ? 'Apple公证上传网络失败；保留候选及任务记录。' : `Apple公证${phase}失败（${result.code}，${kind}）。`), { reason: kind });
      await pause(Math.min(15000, deadline - Date.now()));
    }
  }
  await execute('history', []);
  console.log(JSON.stringify({ event: 'notary.credentials.ready', profile: config.profile, storage, context: userContext ? 'Aqua' : 'asuser' }));
  return {
    config,
    async submit(path, checkpoint, identity) {
      let saved = existsSync(checkpoint) ? JSON.parse(readFileSync(checkpoint, 'utf8')) : {};
      const valid = Object.entries(identity).every(([key, value]) => saved[key] === value);
      if (valid && saved.id && saved.uploaded) {
        if (saved.status === 'Accepted') return { id: saved.id, status: saved.status };
        const result = await execute('wait', [saved.id, '--timeout', '1h']);
        saved = { ...saved, ...result }; saveCheckpoint(checkpoint, saved); return result;
      }
      saved = { ...identity, uploaded: false }; saveCheckpoint(checkpoint, saved);
      const result = await execute('submit', [path, '--no-s3-acceleration', '--wait', '--timeout', '1h'], { normal: true, onProgress: progress => {
        saved = { ...saved, ...Object.fromEntries(Object.entries(progress).filter(([, value]) => value !== undefined)) };
        saveCheckpoint(checkpoint, saved);
      } });
      if (!result.id || !['Accepted', 'Invalid', 'Rejected'].includes(result.status)) throw new Error('Apple公证状态尚未完整返回，已保存任务记录。');
      saved = { ...saved, ...result }; saveCheckpoint(checkpoint, saved);
      return result;
    },
  };
}
