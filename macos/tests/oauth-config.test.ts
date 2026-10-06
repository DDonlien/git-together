import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

test('actual Electron encryption restores configuration across processes and separate temporary bundles without plaintext fallback', { timeout: 40000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'gittogether-auth-config-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const environment = { ...process.env }; delete environment.ELECTRON_RUN_AS_NODE;
  const require = createRequire(import.meta.url);
  const dataPath = join(directory, 'configuration', 'github-oauth-v1.encrypted');
  for (const phase of ['save', 'restore']) {
    const bundleDirectory = join(directory, phase); await mkdir(bundleDirectory, { mode: 0o700 });
    const entry = join(bundleDirectory, 'fixture.cjs');
    await build({ entryPoints: [fileURLToPath(new URL('./oauth-config-fixture.ts', import.meta.url))], bundle: true,
      platform: 'node', format: 'cjs', outfile: entry, external: ['electron'] });
    const child = spawn((require('electron') as string).trim(), [entry, phase, dataPath], { env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
    t.after(() => { if (child.exitCode === null) child.kill('SIGTERM'); });
    let output = ''; let error = '';
    child.stdout.on('data', part => { output += part; }); child.stderr.on('data', part => { error += part; });
    const timer = setTimeout(() => child.kill('SIGTERM'), 15000);
    let code: number | null;
    try { code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); }); }
    finally { clearTimeout(timer); }
    assert.equal(code, 0, error);
    assert.doesNotMatch(output + error, /fixture-cross-process-client-secret|fixture-must-not-be-written/);
    assert.deepEqual(JSON.parse(output.match(/GITTOGETHER_AUTH_CONFIG_RESULT=(.+)/)![1]), { phase, restored: true, encrypted: true, permissions: true });
  }
});
