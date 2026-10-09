import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

test('native encrypted account and directory mappings survive a new bundle/process without rewriting configuration or local files', { timeout: 40000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'gittogether-update-storage-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const environment = { ...process.env }; delete environment.ELECTRON_RUN_AS_NODE;
  const require = createRequire(import.meta.url);
  for (const phase of ['save', 'restore']) {
    const bundle = join(root, phase); await mkdir(bundle);
    const entry = join(bundle, 'fixture.cjs');
    await build({ entryPoints: [fileURLToPath(new URL('./update-storage-fixture.ts', import.meta.url))], bundle: true, platform: 'node', format: 'cjs', outfile: entry, external: ['electron'] });
    const child = spawn((require('electron') as string).trim(), [entry, phase, root], { env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
    t.after(() => { if (child.exitCode === null) child.kill('SIGTERM'); });
    let output = ''; let errors = '';
    child.stdout.on('data', value => { output += value; }); child.stderr.on('data', value => { errors += value; });
    const timer = setTimeout(() => child.kill('SIGTERM'), 15000);
    const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); }).finally(() => clearTimeout(timer));
    assert.equal(code, 0, errors); assert.doesNotMatch(output + errors, /synthetic-upgrade-token/);
    assert.deepEqual(JSON.parse(output.match(/GITTOGETHER_UPDATE_STORAGE=(.+)/)![1]), { phase, encrypted: true, accounts: 1, repositories: 1, links: 1, unchanged: true });
  }
});
