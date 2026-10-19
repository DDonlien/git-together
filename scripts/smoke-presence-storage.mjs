import { sourceState } from './source-state.mjs';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..'), appRoot = join(root, 'desktop/out');
const build = JSON.parse(readFileSync(join(appRoot, 'build-info.json'), 'utf8'));
assert.equal(build.sourceSha256, sourceState(root), 'Rebuild changed sources before checking Presence.');
const require = createRequire(join(root, 'desktop/package.json'));
const { _electron } = require('playwright');
const fixture = mkdtempSync(join(tmpdir(), 'gittogether-presence-native-'));
const output = join(root, 'artifacts/presence-storage', build.version);
mkdirSync(output, { recursive: true });
const email = 'presence@example.invalid', password = 'fixture-' + randomBytes(24).toString('hex'), token = randomBytes(32).toString('hex');
let loginCount = 0;
const server = createServer(async (request, response) => {
  response.setHeader('Content-Type', 'application/json');
  if (request.url === '/v1/account/login' && request.method === 'POST') {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const input = JSON.parse(Buffer.concat(chunks));
    if (input.email !== email || input.password !== password) { response.writeHead(401); response.end('{}'); return; }
    loginCount++;
    response.end(JSON.stringify({ token, expiresAt: Date.now() + 86_400_000, mode: 'personal', repositories: [], account: { id: 'fixture-account', email, displayName: 'Presence Fixture', emailVerified: true, identityId: 'fixture-identity', issuer: address, subject: 'fixture-account' } }));
  } else { response.writeHead(503); response.end(JSON.stringify({ message: 'Isolated storage fixture has no collaboration backend.' })); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = 'http://127.0.0.1:' + server.address().port + '/';
const env = { ...process.env, GIT_CONFIG_GLOBAL: join(fixture, 'gitconfig'), GIT_CONFIG_NOSYSTEM: '1', GITTOGETHER_SMOKE: '1', NODE_ENV: 'development' };
const launch = () => _electron.launch({ executablePath: join(root, 'desktop/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), args: ['--allow-file-access-from-files', '--user-data-dir=' + join(fixture, 'profile'), appRoot], cwd: fixture, env, timeout: 60_000 });
const errors = [], checks = [];
let app, page, account, report, nativeKeyCreated = false;
const attach = async () => {
  page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await page.waitForFunction(() => window.__gittogetherPresence);
  account = join(await app.evaluate(({ app }) => app.getPath('userData')), 'presence');
};
const command = (method, input = {}) => page.evaluate(({ method, input }) => window.__gittogetherPresence.command('presence', method, input), { method, input });
try {
  app = await launch(); await attach();
  assert.equal((await command('status')).ok, true);
  assert.equal((await command('configure', { enabled: true })).ok, true);
  nativeKeyCreated = true;
  const sameKey = await page.evaluate(async () => {
    const storage = window.__gittogetherPresence.storage;
    const values = await Promise.all(Array.from({ length: 12 }, () => storage.key(false, true)));
    return values.every(value => value === values[0]);
  });
  assert.equal(sameKey, true);
  checks.push('The real Desktop host creates one system key for concurrent Presence saves.');
  const signedIn = await command('login', { serverUrl: address, email, password });
  assert.equal(signedIn.ok, true, signedIn.error);
  assert.equal(signedIn.value.account.email, email);
  await command('configure', { enabled: false });
  const file = join(account, 'presence-v1.encrypted'), bytes = readFileSync(file);
  assert.equal(bytes.subarray(0, 4).toString(), 'GTP1');
  for (const secret of [email, password, token]) assert.equal(bytes.includes(Buffer.from(secret)), false);
  checks.push('A loopback-only synthetic account signs in and saves authenticated ciphertext without plaintext credentials.');
  await app.close(); app = await launch(); await attach();
  const restored = await command('status');
  assert.equal(restored.ok, true);
  assert.equal(restored.value.error, '');
  assert.equal(restored.value.account.email, email);
  assert.equal(loginCount, 1);
  checks.push('A new app process restores the same account from the real system keychain without another login.');
  const frame = page.frameLocator('#gittogether-ui');
  await frame.getByRole('button', { name: '设置', exact: true }).click();
  assert.equal((await command('configure', { enabled: true })).ok, true);
  await frame.getByText(email, { exact: false }).first().waitFor({ timeout: 15_000 });
  await page.screenshot({ path: join(output, 'presence-restored.png') });
  assert.equal((await command('configure', { enabled: false })).ok, true);
  assert.deepEqual(errors, []);
  report = { version: build.version, sourceSha256: build.sourceSha256, fixture, checks, pageErrors: errors };
} finally {
  try {
    if (app && account) {
      const removed = await app.evaluate(async (_electron, { path, account }) => {
        const nativeRequire = process.getBuiltinModule('module').createRequire(path);
        const keytar = nativeRequire(path);
        return keytar.deletePassword('GitTogether Presence Safe Storage', account);
      }, { path: join(appRoot, 'keytar.node'), account });
      if (nativeKeyCreated) assert.equal(removed, true, 'Remove the fixture system key');
    }
  } finally {
    try { if (app) await app.close(); }
    finally { await new Promise(resolve => server.close(resolve)); }
  }
}
checks.push('The temporary native key was removed after validation.');
writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ version: build.version, checks, pageErrors: errors, report: join(output, 'report.json') }, null, 2));
