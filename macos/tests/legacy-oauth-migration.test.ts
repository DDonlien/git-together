import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { setTimeout as pause } from 'node:timers/promises';
import { build } from 'esbuild';
import { legacyOAuthMigration } from '../electron/legacy-oauth-migration';
import { githubDevClientId } from '../src/github-web-model';

const secret = 'fixture-legacy-migration-client-secret';
async function fixture(t: TestContext, script: string) {
  const directory = await mkdtemp(join(tmpdir(), 'gittogether-migration-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const legacyPath = join(directory, 'legacy.encrypted');
  const original = Buffer.from('fixture-encrypted-original'); await writeFile(legacyPath, original);
  const entry = join(directory, 'child.cjs'); await writeFile(entry, script);
  const migration = legacyOAuthMigration({ executable: process.execPath, entry, legacyPath });
  t.after(() => migration.close());
  return { migration, legacyPath, original };
}

test('legacy configuration travels only through its bounded private pipe and the original file stays intact', async t => {
  const f = await fixture(t, `const fs=require('node:fs');if(!fs.fstatSync(3).isFIFO()&&!fs.fstatSync(3).isSocket())process.exit(2);process.stdout.write('ignored-public-output');process.stderr.write('ignored-diagnostic-output');fs.writeSync(3,${JSON.stringify(secret)});fs.closeSync(3);`);
  assert.equal(await f.migration.load(), secret);
  assert.deepEqual(await readFile(f.legacyPath), f.original);
});

test('absent legacy configuration never starts a child', async () => {
  const migration = legacyOAuthMigration({ executable: '/fixture/no-executable', legacyPath: '/fixture/no-configuration' });
  assert.equal(await migration.load(), null); migration.close();
});

test('an empty legacy store is an unconfigured result and retains its source', async t => {
  const f = await fixture(t, `require('node:fs').closeSync(3);`);
  assert.equal(await f.migration.load(), null); assert.deepEqual(await readFile(f.legacyPath), f.original);
});

for (const [name, script] of [
  ['oversized output', `require('node:fs').writeSync(3,'x'.repeat(513));`],
  ['failed process', `require('node:fs').writeSync(3,${JSON.stringify(secret)});process.exit(1);`],
  ['account token instead of app configuration', `require('node:fs').writeSync(3,'github_pat_fixture_must_not_migrate');`],
] as const) {
  test(`${name} is rejected without leaking or modifying the old configuration`, async t => {
    const f = await fixture(t, script);
    await assert.rejects(f.migration.load(), problem => {
      assert.ok(problem instanceof Error); assert.doesNotMatch(problem.message, /fixture-legacy-migration-client-secret|github_pat_fixture/); return true;
    });
    assert.deepEqual(await readFile(f.legacyPath), f.original);
  });
}

test('quitting cancels a pending recovery process without changing the source', async t => {
  const f = await fixture(t, `setInterval(()=>{},1000);`);
  const pending = f.migration.load(); await pause(40); f.migration.close();
  await assert.rejects(pending, /迁移.*(未完成|已取消)/); assert.deepEqual(await readFile(f.legacyPath), f.original);
});

test('child launch failure is reported and preserves the source', async t => {
  const f = await fixture(t, '');
  const migration = legacyOAuthMigration({ executable: '/fixture/no-executable', legacyPath: f.legacyPath });
  await assert.rejects(migration.load()); assert.deepEqual(await readFile(f.legacyPath), f.original);
});

test('actual Electron main migration mode preserves its private descriptor without reading the user keychain', { timeout: 20000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'gittogether-electron-migration-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const legacyDirectory = join(directory, 'GitTogether Authorization'); await mkdir(legacyDirectory, { mode: 0o700 });
  const legacyPath = join(legacyDirectory, 'github-oauth-v1.encrypted');
  // Only this synthetic store uses a decryption stub; all app data is isolated.
  const original = Buffer.from(JSON.stringify({ version: 1, clientId: githubDevClientId, secret }));
  await writeFile(legacyPath, original, { mode: 0o600 });
  const entry = join(directory, 'fixture.cjs');
  const main = fileURLToPath(new URL('../electron/main.ts', import.meta.url));
  await build({ stdin: { contents: `import {app,safeStorage} from 'electron';
    app.setPath('appData',${JSON.stringify(directory)});
    safeStorage.isEncryptionAvailable=()=>true;
    safeStorage.decryptString=bytes=>bytes.toString('utf8');
    void import(${JSON.stringify(main)});`,
    resolveDir: fileURLToPath(new URL('..', import.meta.url)), sourcefile: 'migration-fixture.ts', loader: 'ts' },
    bundle: true, platform: 'node', format: 'cjs', outfile: entry, external: ['electron'] });
  const require = createRequire(import.meta.url);
  const migration = legacyOAuthMigration({ executable: (require('electron') as string).trim(), entry, legacyPath });
  t.after(() => migration.close());
  assert.equal(await migration.load(), secret);
  assert.deepEqual(await readFile(legacyPath), original);
});
