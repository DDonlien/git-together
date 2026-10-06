import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

test('actual Chromium runtime preserves direct/proxy/PAC, abort and TLS behavior', { timeout: 30000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'gittogether-network-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await promisify(execFile)('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=network-fixture.test', '-addext', 'subjectAltName=IP:127.0.0.1',
    '-keyout', join(directory, 'key.pem'), '-out', join(directory, 'cert.pem')]);
  const entry = join(directory, 'fixture.cjs');
  await build({ entryPoints: [fileURLToPath(new URL('./system-network-fixture.ts', import.meta.url))], bundle: true, platform: 'node', format: 'cjs', outfile: entry, external: ['electron'] });
  const environment = { ...process.env }; delete environment.ELECTRON_RUN_AS_NODE;
  const require = createRequire(import.meta.url);
  const child = spawn((require('electron') as string).trim(), [entry], { env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => { if (child.exitCode === null) child.kill('SIGTERM'); });
  let output = ''; let error = ''; child.stdout.on('data', part => { output += part; }); child.stderr.on('data', part => { error += part; });
  const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  assert.equal(code, 0, error);
  const results = JSON.parse(output.match(/GITTOGETHER_NETWORK_RESULT=(.+)/)![1]) as string[];
  assert.equal(results.length, 7); for (const result of results) t.diagnostic(result);
});
test('production network uses the system route without changing user proxy or TLS policy', () => {
  const network = readFileSync(new URL('../electron/system-network.ts', import.meta.url), 'utf8');
  assert.match(network, /systemFetch = fetchWithSession\(net\)/); assert.match(network, /credentials: 'omit'/);
  assert.doesNotMatch(network, /7890|HTTP_PROXY|HTTPS_PROXY|NODE_USE_ENV_PROXY|rejectUnauthorized|setCertificateVerifyProc|ignore-certificate-errors/);
  assert.match(network, /local.setProxy\(\{ mode: 'direct' \}\)/);
  const entry = readFileSync(new URL('../electron/github-oauth-dev.ts', import.meta.url), 'utf8');
  assert.match(entry, /fromPartition\('gittogether-oauth-remote', \{ cache: false \}\)/);
  assert.doesNotMatch(entry, /setProxy|appendSwitch|readFile|token:/);
});
