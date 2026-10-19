import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createCipheriv, createDecipheriv, createHash, pbkdf2Sync, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(join(root, 'desktop/package.json'));
const ts = require('typescript');
const source = readFileSync(join(root, 'desktop/app/src/ui/gittogether/presence-storage.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function storageClass(store) {
  const exports = {};
  new Function('exports', 'require', compiled)(exports, name => name === '../../lib/stores/token-store' ? { TokenStore: store } : require(name));
  return exports;
}

test('concurrent Presence writes share one system key and profiles remain independent', async () => {
  const values = new Map(), writes = [];
  const { PresenceStorage, presenceStorageService } = storageClass({
    getItem: async (service, account) => values.get(service + account) ?? null,
    setItem: async (service, account, value) => { writes.push({ service, account }); values.set(service + account, value); },
  });
  const storage = new PresenceStorage('/fixture/dev/presence');
  const keys = await Promise.all(Array.from({ length: 12 }, () => storage.key(false, true)));
  assert.equal(new Set(keys).size, 1);
  assert.equal(Buffer.from(keys[0], 'base64').length, 32);
  assert.deepEqual(writes, [{ service: presenceStorageService, account: '/fixture/dev/presence' }]);
  assert.equal(await new PresenceStorage('/fixture/dev/presence').key(false, false), keys[0]);
  assert.notEqual(await new PresenceStorage('/fixture/other/presence').key(false, true), keys[0]);
});

test('system storage denial can be retried without caching a failed or unsaved key', async () => {
  let denied = true, failWrite = true, value = null;
  const { PresenceStorage } = storageClass({
    getItem: async () => { if (denied) throw new Error('private native details'); return value; },
    setItem: async (_service, _account, next) => { if (failWrite) throw new Error('private write details'); value = next; },
  });
  const storage = new PresenceStorage('/fixture/retry');
  await assert.rejects(storage.key(false, true), /无法访问 Presence 系统安全存储/);
  denied = false;
  await assert.rejects(storage.key(false, true), /无法访问 Presence 系统安全存储/);
  assert.equal(value, null);
  failWrite = false;
  assert.equal(await storage.key(false, true), value);
});

test('legacy keys are read only and missing keys are never silently replaced', async () => {
  let legacy = null;
  const { PresenceStorage } = storageClass({
    getItem: async (service, account) => { assert.equal(service, 'GitTogether Safe Storage'); assert.equal(account, 'GitTogether'); return legacy; },
    setItem: async () => assert.fail('must not replace a missing legacy key'),
  });
  const storage = new PresenceStorage('/fixture/legacy');
  await assert.rejects(storage.key(true, true), /加密密钥不存在/);
  legacy = 'synthetic-legacy-key';
  assert.equal(await storage.key(true, false), legacy);
});

const syntheticKey = 'fixture-presence-key-' + randomBytes(32).toString('base64');
const legacyKey = 'fixture-legacy-key-' + randomBytes(32).toString('base64');
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'gittogether-presence-storage-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function helper(t, directory, storageKey = input => input.legacy ? legacyKey : syntheticKey) {
  const child = spawn(join(root, 'desktop/gittogether-presence/target/debug/gittogether-presence'), [directory], {
    env: { ...process.env, GITTOGETHER_PRESENCE_CONFIG_DIR: join(directory, 'isolated-editor-config') }, stdio: 'pipe',
  });
  const pending = new Map(), calls = [];
  let stderr = '', sequence = 0;
  child.stderr.on('data', bytes => { stderr += bytes; });
  child.on('error', error => { for (const item of pending.values()) item.reject(error); });
  child.on('exit', () => { for (const item of pending.values()) item.reject(new Error('Helper exited: ' + stderr)); pending.clear(); });
  const lines = createInterface({ input: child.stdout });
  lines.on('line', async line => {
    const message = JSON.parse(line);
    if (message.callbackId) {
      calls.push({ method: message.method, input: message.input });
      try {
        const value = message.method === 'storageKey' ? await storageKey(message.input) : message.method === 'catalog' ? { accounts: [], repositories: [], links: [] } : [];
        child.stdin.write(JSON.stringify({ callbackId: message.callbackId, ok: true, value }) + '\n');
      } catch (error) {
        child.stdin.write(JSON.stringify({ callbackId: message.callbackId, ok: false, error: error.message }) + '\n');
      }
    } else {
      const item = pending.get(message.id);
      if (item) { pending.delete(message.id); item.resolve(message); }
    }
  });
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill();
    await exited;
  };
  t.after(stop);
  return {
    calls, stop,
    command: (method, input = {}) => new Promise((resolve, reject) => {
      const id = String(++sequence);
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('Helper request timed out: ' + stderr)); }, 10_000);
      pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
      child.stdin.write(JSON.stringify({ id, group: 'presence', method, input }) + '\n');
    }),
  };
}
const helperOptions = { skip: process.platform === 'win32' ? 'macOS/Linux GCM format; Windows keeps DPAPI' : false, timeout: 20_000 };
const config = () => ({ version: 1, enabled: false, serverUrl: 'http://127.0.0.1:9/', serverName: 'Fixture', serverToken: '', deviceId: 'fixture-device', account: null, servers: [] });
function encrypt(value, key, format) {
  const data = Buffer.from(JSON.stringify(value));
  if (format === 'v10') {
    const cipher = createCipheriv('aes-128-cbc', pbkdf2Sync(key, 'saltysalt', 1003, 16, 'sha1'), Buffer.alloc(16, 32));
    return Buffer.concat([Buffer.from('v10'), cipher.update(data), cipher.final()]);
  }
  const nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm', createHash('sha256').update(key).digest(), nonce);
  return Buffer.concat([Buffer.from(format), nonce, cipher.update(data), cipher.final(), cipher.getAuthTag()]);
}
function decrypt(bytes, key) {
  const decipher = createDecipheriv('aes-256-gcm', createHash('sha256').update(key).digest(), bytes.subarray(4, 16));
  decipher.setAuthTag(bytes.subarray(-16));
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(16, -16)), decipher.final()]));
}

test('helper creates encrypted private state and restores the same device after restart', helperOptions, async t => {
  const directory = fixture(t), first = helper(t, directory);
  assert.equal((await first.command('status')).ok, true);
  assert.equal(first.calls.length, 0, 'empty profiles must not request the old app key');
  assert.equal((await first.command('configure', { enabled: false })).ok, true);
  const path = join(directory, 'presence-v1.encrypted'), bytes = readFileSync(path);
  assert.equal(bytes.subarray(0, 4).toString(), 'GTP1');
  assert.equal(bytes.includes(Buffer.from(syntheticKey)), false);
  const saved = decrypt(bytes, syntheticKey);
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.equal(statSync(directory).mode & 0o777, 0o700);
  await first.stop();
  const second = helper(t, directory);
  assert.equal((await second.command('status')).value.error, '');
  await second.command('configure', { enabled: false });
  assert.equal(decrypt(readFileSync(path), syntheticKey).deviceId, saved.deviceId);
  assert.ok(second.calls.filter(c => c.method === 'storageKey').every(c => c.input.legacy === false));
});

for (const format of ['GTT1', 'v10']) test(`helper reads ${format} and migrates only on successful save`, helperOptions, async t => {
  const directory = fixture(t), path = join(directory, 'presence-v1.encrypted');
  const original = encrypt(config(), legacyKey, format);
  writeFileSync(path, original);
  const process = helper(t, directory);
  assert.equal((await process.command('status')).value.error, '');
  assert.deepEqual(readFileSync(path), original, 'reading must not rewrite legacy files');
  assert.equal((await process.command('configure', { enabled: false })).ok, true);
  const migrated = readFileSync(path);
  assert.equal(migrated.subarray(0, 4).toString(), 'GTP1');
  assert.equal(decrypt(migrated, syntheticKey).deviceId, 'fixture-device');
  assert.ok(process.calls.some(c => c.method === 'storageKey' && c.input.legacy && !c.input.create));
});

test('helper retries a denied first save without creating a plaintext or partial file', helperOptions, async t => {
  const directory = fixture(t);
  let denied = true;
  const process = helper(t, directory, () => { if (denied) throw new Error('fixture keychain denied'); return syntheticKey; });
  const failed = await process.command('configure', { enabled: false });
  assert.equal(failed.ok, false);
  assert.match(failed.error, /fixture keychain denied/);
  assert.equal(existsSync(join(directory, 'presence-v1.encrypted')), false);
  denied = false;
  assert.equal((await process.command('configure', { enabled: false })).ok, true);
});

test('helper preserves inaccessible and tampered existing ciphertext byte for byte', helperOptions, async t => {
  for (const tampered of [false, true]) {
    const directory = fixture(t), path = join(directory, 'presence-v1.encrypted');
    const original = encrypt(config(), syntheticKey, 'GTP1');
    if (tampered) original[original.length - 1] ^= 1;
    writeFileSync(path, original);
    const process = helper(t, directory, () => { if (!tampered) throw new Error('fixture keychain denied'); return syntheticKey; });
    assert.notEqual((await process.command('status')).value.error, '');
    assert.equal((await process.command('configure', { enabled: false })).ok, false);
    assert.deepEqual(readFileSync(path), original);
    await process.stop();
    if (!tampered) {
      const recovered = helper(t, directory);
      assert.equal((await recovered.command('status')).value.error, '');
      assert.equal((await recovered.command('configure', { enabled: false })).ok, true);
      assert.equal(decrypt(readFileSync(path), syntheticKey).deviceId, 'fixture-device');
    }
  }
});

test('helper services startup callbacks while loading encrypted control configuration and journal', helperOptions, async t => {
  const directory = fixture(t);
  writeFileSync(join(directory, 'presence-v1.encrypted'), encrypt(config(), syntheticKey, 'GTP1'));
  const control = { enabled: false, name: '', serverUrl: '', binding: '', deviceId: '', userId: '', deviceToken: '', projects: [] };
  writeFileSync(join(directory, 'remote-control-v1.encrypted'), encrypt(control, syntheticKey, 'GTP1'));
  writeFileSync(join(directory, 'remote-control-journal-v1.encrypted'), encrypt({}, syntheticKey, 'GTP1'));
  const process = helper(t, directory);
  assert.equal((await process.command('status')).value.error, '');
  assert.equal(process.calls.filter(c => c.method === 'storageKey').length, 3);
});
