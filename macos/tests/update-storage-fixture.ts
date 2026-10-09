import { app, safeStorage } from 'electron';
import assert from 'node:assert/strict';
import { readFile, mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { encryptedStore } from '../electron/credential-store';
import { AccountService, type SavedState } from '../server/account-service';
import { isCatalog } from '../src/import-model';

// Owns only the test-supplied directory and synthetic credentials. Never uses
// the production app's userData or the user's account file.
const phase = process.argv[2]; const root = process.argv[3];
app.setName('GitTogether Update Storage Fixture');
app.setPath('userData', __dirname); app.setPath('sessionData', __dirname);
const token = 'synthetic-upgrade-token';
const account = { id: 'fixture-account', provider: 'gitea' as const, host: 'https://git.fixture.test', login: 'fixture', name: 'Fixture', updatedAt: '2026-10-09T00:00:00Z' };
const repository = { id: 'fixture-repository', remoteId: 1, accountId: account.id, name: 'project', fullName: 'fixture/project', description: '', defaultBranch: 'main', private: true, url: 'https://git.fixture.test/fixture/project', available: true };
app.whenReady().then(async () => {
  app.dock?.hide(); assert.ok(root && ['save', 'restore'].includes(phase)); assert.ok(safeStorage.isEncryptionAvailable());
  const local = join(root, 'checkout with spaces'); const marker = join(local, 'work.txt');
  const path = join(root, 'data', 'accounts-v2.encrypted');
  const state: SavedState = { version: 2, accounts: [{ account, token }], repositories: [repository], links: [{ repositoryId: repository.id, path: local }] };
  const store = encryptedStore(path);
  if (phase === 'save') {
    await mkdir(local); await writeFile(marker, 'uncommitted fixture content\n'); await store.save(state);
  }
  const before = await readFile(path);
  const service = new AccountService(store, async () => { throw new Error('Unexpected remote call on restore'); });
  const catalog = await service.handle('catalog', {}); assert.ok(isCatalog(catalog));
  assert.deepEqual(catalog.accounts, [account]); assert.deepEqual(catalog.repositories, [repository]); assert.deepEqual(catalog.links, state.links);
  assert.equal(JSON.stringify(catalog).includes(token), false);
  assert.deepEqual(await readFile(path), before); assert.deepEqual(await store.load(), state);
  assert.equal(before.includes(Buffer.from(token)), false); assert.equal((await stat(path)).mode & 0o777, 0o600);
  assert.equal(await readFile(marker, 'utf8'), 'uncommitted fixture content\n');
  process.stdout.write(`GITTOGETHER_UPDATE_STORAGE=${JSON.stringify({ phase, encrypted: true, accounts: 1, repositories: 1, links: 1, unchanged: true })}\n`);
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
