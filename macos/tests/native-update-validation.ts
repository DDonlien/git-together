import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as pause } from 'node:timers/promises';

// Opt-in native integration: only clones a caller-selected signed package,
// installs within mkdtemp and deletes its own data; never opens the user's app.
const execute = promisify(execFile);
const base = process.argv[2]; assert.ok(base?.endsWith('/GitTogether.app'));
const root = await mkdtemp(join(tmpdir(), 'gittogether-native-update-'));
const nonce = root.split('/').pop()!;
const bundleId = `com.gittogether.updater-fixture.${nonce.toLowerCase()}`;
const cache = join(homedir(), 'Library', 'Caches', `gittogether-native-fixture-${nonce}`);
let valid = false; let zip: Buffer;
const server = createServer((req, res) => {
  const path = new URL(req.url!, 'http://127.0.0.1').pathname;
  if (path === '/valid') { valid = true; res.end('ok'); return; }
  if (path === '/latest-mac.yml') {
    res.setHeader('Content-Type', 'text/yaml');
    res.end(JSON.stringify({ version: '0.9.0', files: [{ url: 'GitTogether-fixture-0.9.0-arm64.zip', sha512: valid ? createHash('sha512').update(zip).digest('base64') : Buffer.alloc(64).toString('base64'), size: zip.length }], releaseDate: new Date().toISOString() })); return;
  }
  if (path === '/GitTogether-fixture-0.9.0-arm64.zip') { res.setHeader('Content-Length', zip.length); res.end(zip); return; }
  res.statusCode = 404; res.end();
});
await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
const address = server.address(); assert.ok(address && typeof address !== 'string');
const feed = `http://127.0.0.1:${address.port}/`;
let child: ReturnType<typeof spawn> | undefined;
let launchError: Error | undefined;
try {
  await mkdir(join(root, 'profile')); await mkdir(join(root, 'checkout')); await writeFile(join(root, 'checkout', 'work.txt'), 'uncommitted fixture work\n');
  const fixture = join(root, 'fixture.cjs');
  await build({ entryPoints: [fileURLToPath(new URL('./native-update-fixture.ts', import.meta.url))], bundle: true, platform: 'node', target: 'node22', format: 'cjs', outfile: fixture, external: ['electron'], define: { FIXTURE_ROOT: JSON.stringify(root), FIXTURE_FEED: JSON.stringify(feed) } });
  for (const version of ['0.8.99', '0.9.0']) {
    const appPath = join(root, version, 'GitTogether.app');
    // Native copy preserves framework symlinks and resource seals verbatim.
    await execute('/usr/bin/ditto', [base, appPath]);
    await cp(fixture, join(appPath, 'Contents', 'Resources', 'app', 'desktop', 'main.cjs'));
    const configPath = join(appPath, 'Contents', 'Resources', 'app-update.yml');
    await writeFile(configPath, JSON.stringify({ provider: 'generic', url: feed, updaterCacheDirName: `gittogether-native-fixture-${nonce}` }));
    const packagePath = join(appPath, 'Contents', 'Resources', 'app', 'package.json');
    const manifest = JSON.parse(await readFile(packagePath, 'utf8')); manifest.version = version; await writeFile(packagePath, JSON.stringify(manifest));
    await execute('/usr/libexec/PlistBuddy', ['-c', `Set :CFBundleShortVersionString ${version}`, join(appPath, 'Contents', 'Info.plist')]);
    await execute('/usr/libexec/PlistBuddy', ['-c', `Set :CFBundleVersion ${version}`, join(appPath, 'Contents', 'Info.plist')]);
    // Isolate Squirrel/ShipIt caches from the real application's bundle ID too.
    await execute('/usr/libexec/PlistBuddy', ['-c', `Set :CFBundleIdentifier ${bundleId}`, join(appPath, 'Contents', 'Info.plist')]);
    // Unchanged nested frameworks retain the original verified signatures.
    await execute('/usr/bin/codesign', ['--force', '--sign', 'Developer ID Application: ZHENGTAO GONG (86J7X3KZ5Z)', '--options', 'runtime', '--entitlements', resolve(dirname(fileURLToPath(import.meta.url)), '../electron/entitlements.plist'), '--timestamp', appPath], { timeout: 60000 });
    await execute('/usr/bin/codesign', ['--verify', '--deep', '--strict', appPath]);
  }
  const archive = join(root, 'update.zip'); await execute('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', join(root, '0.9.0', 'GitTogether.app'), archive]); zip = await readFile(archive);
  const environment = { ...process.env }; delete environment.ELECTRON_RUN_AS_NODE;
  child = spawn(join(root, '0.8.99', 'GitTogether.app', 'Contents', 'MacOS', 'GitTogether'), [], { env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout?.on('data', value => process.stdout.write(value));
  child.stderr?.on('data', value => process.stderr.write(value));
  child.on('error', error => { launchError = error; });
  for (let attempt = 0; attempt < 240; attempt++) {
    if (launchError) throw launchError;
    const failure = await readFile(join(root, 'failure.txt'), 'utf8').catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (failure) throw new Error(failure);
    const result = await readFile(join(root, 'result.json'), 'utf8').catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (result) {
      assert.equal(JSON.parse(result).upgraded, true);
      const evidence = resolve(dirname(fileURLToPath(import.meta.url)), '../../artifacts/desktop-updater'); await mkdir(evidence, { recursive: true });
      await writeFile(join(evidence, 'native-validation.json'), result + '\n');
      console.log(result); break;
    }
    if (attempt === 239) throw new Error('Native signed update did not restart within 120 seconds');
    await pause(500);
  }
  const plist = await execute('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', join(root, '0.8.99', 'GitTogether.app', 'Contents', 'Info.plist')]); assert.equal(plist.stdout.trim(), '0.9.0');
} finally {
  if (child && child.exitCode === null) child.kill('SIGTERM');
  await new Promise<void>(done => server.close(() => done()));
  await rm(cache, { recursive: true, force: true });
  await rm(join(homedir(), 'Library', 'Caches', `${bundleId}.ShipIt`), { recursive: true, force: true });
  await rm(root, { recursive: true, force: true });
}
