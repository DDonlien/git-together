import { app, safeStorage } from 'electron';
import assert from 'node:assert/strict';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { oauthConfigurationStore } from '../electron/oauth-config-store';
import { encryptedStore } from '../electron/credential-store';
import { githubDevClientId } from '../src/github-web-model';

// Test-only entry. Both data and bundle directories are owned by the test.
app.setName('GitTogether Authorization Fixture');
app.setPath('userData', __dirname); app.setPath('sessionData', __dirname);
const fixtureSecret = 'fixture-cross-process-client-secret';
const phase = process.argv[2]; const path = process.argv[3];
app.whenReady().then(async () => {
  app.dock?.hide();
  assert.ok(path && ['save', 'restore'].includes(phase));
  assert.equal(safeStorage.isEncryptionAvailable(), true);
  const store = oauthConfigurationStore(path);
  if (phase === 'save') {
    assert.equal(await store.load(), null); await store.save(fixtureSecret);
  } else {
    assert.equal(await store.load(), fixtureSecret);
    const original = await readFile(path);
    // Denial is simulated inside this isolated process, never by locking the user's keychain.
    const available = safeStorage.isEncryptionAvailable;
    safeStorage.isEncryptionAvailable = () => false;
    try { await assert.rejects(store.save('fixture-must-not-be-written'), /安全存储不可用/); }
    finally { safeStorage.isEncryptionAvailable = available; }
    assert.deepEqual(await readFile(path), original);
    await assert.rejects(store.save('github_pat_fixture'), /不是账号/);
    assert.deepEqual(await readFile(path), original);

    const invalidPath = join(dirname(path), 'invalid.encrypted');
    const invalid = oauthConfigurationStore(invalidPath);
    for (const value of [{ version: 2, clientId: githubDevClientId, secret: fixtureSecret }, { version: 1, clientId: 'another-app', secret: fixtureSecret }, { version: 1, clientId: githubDevClientId, secret: 'github_pat_fixture' }]) {
      await encryptedStore<unknown>(invalidPath).save(value); const before = await readFile(invalidPath);
      await assert.rejects(invalid.load()); assert.deepEqual(await readFile(invalidPath), before);
    }
    await writeFile(invalidPath, Buffer.from('invalid-encrypted-fixture'), { mode: 0o600 });
    const before = await readFile(invalidPath); await assert.rejects(invalid.load(), /无法解密/);
    assert.deepEqual(await readFile(invalidPath), before);
  }
  const bytes = await readFile(path);
  assert.equal(bytes.includes(Buffer.from(fixtureSecret)), false);
  assert.equal(bytes.includes(Buffer.from(githubDevClientId)), false);
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  assert.equal((await stat(dirname(path))).mode & 0o777, 0o700);
  assert.equal(await store.load(), fixtureSecret);
  process.stdout.write(`GITTOGETHER_AUTH_CONFIG_RESULT=${JSON.stringify({ phase, restored: true, encrypted: true, permissions: true })}\n`);
  app.exit(0);
}).catch(() => {
  process.stderr.write('Isolated authorization configuration verification failed.\n'); app.exit(1);
});
