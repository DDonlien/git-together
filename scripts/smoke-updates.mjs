import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as pause } from 'node:timers/promises';
import { createRequire } from 'node:module';

const root = resolve(import.meta.dirname, '..');
const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
const destination = join(root, 'artifacts/releases', version);
const report = JSON.parse(await readFile(join(destination, 'package-darwin-arm64.json'), 'utf8'));
const production = join(report.directory, 'GitTogether.app');
const fixture = await mkdtemp(join(tmpdir(), 'gittogether-upgrade-'));
const identifier = 'com.gittogether.upgradefixture.' + fixture.split('/').pop().toLowerCase();
const execute = promisify(execFile);
const run = async (cmd, args, options = {}) => execute(cmd, args, { cwd: root, maxBuffer: 8 * 1024 * 1024, ...options });
const tarName = `GitTogether-${version}-macOS-arm64.app.tar.gz`;
const signature = (await readFile(join(destination, tarName + '.sig'), 'utf8')).trim();
const profile = join(fixture, 'profile'); await mkdir(profile);
const sentinel = Buffer.from('synthetic encrypted profile sentinel');
await writeFile(join(profile, 'preserved.encrypted'), sentinel);
await writeFile(join(profile, 'work.txt'), 'uncommitted local work\n');
const server = createServer((request, response) => {
  const path = new URL(request.url, 'http://127.0.0.1').pathname;
  if (path === '/latest.json') {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ version, pub_date: new Date().toISOString(), platforms: { 'darwin-aarch64': { url: origin + '/update.tar.gz', signature } } }));
  } else if (path === '/squirrel') {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ url: origin + '/update.zip', name: version, notes: 'isolated signed update', pub_date: new Date().toISOString() }));
  } else if (path === '/update.tar.gz' || path === '/update.zip') {
    response.setHeader('content-type', 'application/octet-stream');
    createReadStream(path.endsWith('.zip') ? join(fixture, 'update.zip') : join(destination, tarName)).pipe(response);
  } else { response.writeHead(404); response.end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
let child;
try {
  const cached = join(root, 'artifacts/updates-test'); await mkdir(cached, { recursive: true });
  const oldZip = join(cached, 'GitTogether-0.33.0-macOS-arm64.zip');
  try { await access(oldZip) } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await run('curl', ['--fail', '--location', '--silent', '--show-error', '--retry', '2', '--output', oldZip, 'https://github.com/DDonlien/git-together/releases/download/v0.33.0/GitTogether-0.33.0-macOS-arm64.zip']);
  }
  assert.equal(createHash('sha256').update(await readFile(oldZip)).digest('hex'), 'fa2709fe5e79da90ba595ccd17d1af652b0f24e178de0378bc635a452bd29645');
  const legacy = join(fixture, 'legacy'); await mkdir(legacy);
  await run('ditto', ['-x', '-k', oldZip, legacy]);
  const legacyApp = join(legacy, 'GitTogether.app');
  const evidence = join(fixture, 'legacy-result.json');
  const feed = process.argv.includes('--public') ? 'https://github.com/DDonlien/git-together/releases/latest/download/latest.json' : origin + '/latest.json';
  await run(join(root, 'tools/upgrade-fixture/target/debug/gittogether-upgrade-fixture'), [feed, join(legacyApp, 'Contents/MacOS/gittogether'), evidence], { timeout: 600000 });
  const legacyResult = JSON.parse(await readFile(evidence, 'utf8')); assert.equal(legacyResult.to, version);
  const installed = (await run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', join(legacyApp, 'Contents/Info.plist')])).stdout.trim();
  assert.equal(installed, version);
  await run('codesign', ['--verify', '--deep', '--strict', legacyApp]);
  await run('xcrun', ['stapler', 'validate', legacyApp]);

  if (!process.argv.includes('--public')) {
    const old = join(fixture, 'desktop-old/GitTogether.app'), next = join(fixture, 'desktop-new/GitTogether.app');
    for (const app of [old, next]) {
      await run('ditto', [production, app]);
      const plist = join(app, 'Contents/Info.plist');
      await run('/usr/libexec/PlistBuddy', ['-c', `Set :CFBundleIdentifier ${identifier}`, plist]);
      if (app === old) {
        for (const key of ['CFBundleShortVersionString', 'CFBundleVersion']) await run('/usr/libexec/PlistBuddy', ['-c', `Set :${key} 0.36.99`, plist]);
      }
      const entry = join(app, 'Contents/Resources/app/gittogether-main.cjs');
      const setup = `const {app,autoUpdater}=require('electron'); const fs=require('node:fs'); app.setPath('userData',${JSON.stringify(profile)}); app.setPath('sessionData',${JSON.stringify(profile)});\n`;
      const content = app === old
        ? setup + `app.whenReady().then(()=>{ autoUpdater.on('error', e=>{fs.writeFileSync(${JSON.stringify(join(fixture, 'failure.txt'))},e.message);app.exit(1)}); autoUpdater.on('update-downloaded',()=>autoUpdater.quitAndInstall()); autoUpdater.setFeedURL({url:${JSON.stringify(origin + '/squirrel')}}); autoUpdater.checkForUpdates(); });`
        : setup + `app.whenReady().then(()=>{fs.writeFileSync(${JSON.stringify(join(fixture, 'desktop-result.json'))},JSON.stringify({version:app.getVersion(),profile:app.getPath('userData')}));setTimeout(()=>app.exit(0),2000)}); require('./main.js');`;
      await writeFile(entry, content);
      await run('codesign', ['--force', '--sign', report.signature, '--options', 'runtime', '--timestamp', '--entitlements', join(root, 'desktop/script/entitlements.plist'), app], { timeout: 120000 });
      await run('codesign', ['--verify', '--deep', '--strict', app]);
    }
    await run('ditto', ['-c', '-k', '--keepParent', next, join(fixture, 'update.zip')]);
    child = spawn(join(old, 'Contents/MacOS/gittogether'), [], { stdio: ['ignore', 'ignore', 'pipe'] });
    let output = ''; child.stderr.on('data', value => { output += value.toString().slice(-2000); });
    let result;
    for (let attempt = 0; attempt < 180; attempt++) {
      try { result = JSON.parse(await readFile(join(fixture, 'desktop-result.json'), 'utf8')); break } catch (error) { if (error.code !== 'ENOENT') throw error }
      try { throw new Error(await readFile(join(fixture, 'failure.txt'), 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
      await pause(1000);
    }
    assert.ok(result, 'Squirrel did not restart the signed fixture: ' + output.slice(-4000));
    assert.equal(result.version, version); assert.equal(result.profile, profile);
  }
  // Launch the result installed by the 0.33 updater with a private, caller-selected profile.
  const require = createRequire(join(root, 'desktop/package.json'));
  const { _electron } = require('playwright');
  const app = await _electron.launch({ executablePath: join(legacyApp, 'Contents/MacOS/gittogether'), args: ['--user-data-dir=' + profile], env: { ...process.env, GITTOGETHER_SMOKE: '1' }, timeout: 60000 });
  try {
    const page = await app.firstWindow(); await page.waitForFunction(() => window.__gittogetherAdapter);
    let frame;
    for (let attempt = 0; attempt < 100; attempt++) {
      frame = page.frames().find(candidate => candidate.url().includes('/gittogether/index.html'));
      if (frame) break;
      await pause(100);
    }
    assert.ok(frame, 'The installed application did not attach its presentation frame.');
    await frame.waitForFunction(() => window.gittogether?.updates);
    const status = await frame.evaluate(() => window.gittogether.updates.status());
    assert.equal(status.currentVersion, version); assert.notEqual(status.phase, 'unavailable');
  } finally { await app.close(); }
  assert.deepEqual(await readFile(join(profile, 'preserved.encrypted')), sentinel);
  assert.equal(await readFile(join(profile, 'work.txt'), 'utf8'), 'uncommitted local work\n');
  const result = { ...legacyResult, signedDesktopUpdate: !process.argv.includes('--public'), profilePreserved: true, productionBridge: true, publicFeed: process.argv.includes('--public') };
  await writeFile(join(destination, process.argv.includes('--public') ? 'public-upgrade-validation.json' : 'native-upgrade-validation.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
} finally {
  if (child && child.exitCode === null) child.kill('SIGTERM');
  await new Promise(done => server.close(done));
  await rm(join(homedir(), 'Library/Caches', identifier + '.ShipIt'), { recursive: true, force: true });
  await rm(fixture, { recursive: true, force: true });
}
