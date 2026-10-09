import { app } from 'electron';
import { MacUpdater } from 'electron-updater';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AppUpdater } from '../electron/app-updater';
import { encryptedStore } from '../electron/credential-store';
import { AccountService, type SavedState } from '../server/account-service';
import { isCatalog } from '../src/import-model';

// These constants are injected into this test-only bundle, never production.
declare const FIXTURE_ROOT: string;
declare const FIXTURE_FEED: string;
app.setName('GitTogether');
app.setPath('userData', join(FIXTURE_ROOT, 'profile'));
app.setPath('sessionData', join(FIXTURE_ROOT, 'profile'));
const data = join(FIXTURE_ROOT, 'profile', 'accounts-v2.encrypted');
const path = join(FIXTURE_ROOT, 'checkout');
const account = { id: 'upgrade-account', provider: 'gitea' as const, host: 'https://git.fixture.test', login: 'fixture', name: 'Fixture', updatedAt: '2026-10-09T00:00:00Z' };
const repository = { id: 'upgrade-repository', accountId: account.id, remoteId: 1, name: 'project', fullName: 'fixture/project', description: '', defaultBranch: 'main', private: true, available: true, url: 'https://git.fixture.test/fixture/project' };
const state: SavedState = { version: 2, accounts: [{ account, token: 'synthetic-native-update-token' }], repositories: [repository], links: [{ repositoryId: repository.id, path }] };
app.whenReady().then(async () => {
  app.dock?.hide();
  const store = encryptedStore(data);
  if (app.getVersion() === '0.8.99') {
    await store.save(state);
    await writeFile(join(FIXTURE_ROOT, 'before.sha256'), createHash('sha256').update(await readFile(data)).digest('hex'));
    const engine = new MacUpdater({ provider: 'generic', url: FIXTURE_FEED });
    engine.logger = null;
    engine.on('error', error => console.error('Fixture updater:', error.message));
    const controller = new AppUpdater(engine, app.getVersion(), () => true);
    console.log('Checking isolated native update');
    assert.equal((await controller.check()).phase, 'available');
    assert.equal((await controller.download()).phase, 'error');
    await writeFile(join(FIXTURE_ROOT, 'checksum-rejected'), 'true');
    await fetch(`${FIXTURE_FEED}valid`);
    assert.equal((await controller.check()).phase, 'available');
    console.log('Downloading signed native fixture');
    assert.equal((await controller.download()).phase, 'ready');
    console.log('Installing signed native fixture');
    assert.equal(controller.install().phase, 'installing');
  } else {
    assert.equal(app.getVersion(), '0.9.0');
    const service = new AccountService(store, async () => { throw new Error('Unexpected network on restore'); });
    const catalog = await service.handle('catalog', {}); assert.ok(isCatalog(catalog));
    assert.deepEqual(catalog.accounts, [account]); assert.deepEqual(catalog.repositories, [repository]); assert.deepEqual(catalog.links, state.links);
    assert.equal(createHash('sha256').update(await readFile(data)).digest('hex'), await readFile(join(FIXTURE_ROOT, 'before.sha256'), 'utf8'));
    assert.equal(await readFile(join(path, 'work.txt'), 'utf8'), 'uncommitted fixture work\n');
    assert.equal(await readFile(join(FIXTURE_ROOT, 'checksum-rejected'), 'utf8'), 'true');
    await writeFile(join(FIXTURE_ROOT, 'result.json'), JSON.stringify({ upgraded: true, from: '0.8.99', to: app.getVersion(), checksumRejected: true, accounts: 1, repositories: 1, links: 1, encryptedBytesUnchanged: true, localFilesUnchanged: true }));
    app.exit(0);
  }
}).catch(async error => {
  await writeFile(join(FIXTURE_ROOT, 'failure.txt'), error instanceof Error ? error.message : 'Native fixture failed');
  app.exit(1);
});
