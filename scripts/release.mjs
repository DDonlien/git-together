import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, copyFileSync, writeFileSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { sourceState } from './source-state.mjs';

const root = resolve(import.meta.dirname, '..');
const repository = 'DDonlien/git-together';
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const tag = `v${version}`;
const destination = join(root, 'artifacts/releases', version);
mkdirSync(destination, { recursive: true });
const run = (cmd, args, options = {}) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit', env: { ...process.env, GODEBUG: 'http2client=0' }, ...options });
const capture = (cmd, args) => run(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' }).trim();
const gh = args => capture('gh', [...args, '--repo', repository]);
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
assert.equal(process.platform, 'darwin');
assert.equal(process.arch, 'arm64');
assert.equal(capture('git', ['branch', '--show-current']), 'main');
assert.equal(capture('git', ['status', '--porcelain']), '', 'Commit the intended changes before release.');
const head = capture('git', ['rev-parse', 'HEAD']);
assert.equal(capture('git', ['ls-remote', 'origin', 'refs/heads/main']).split(/\s/)[0], head, 'Push main before release.');
let commit = head;
const macReport = join(destination, 'package-darwin-arm64.json');
const outBuild = join(root, 'desktop/out/build-info.json');
for (const previous of [existsSync(macReport) ? json(macReport).build : undefined, existsSync(outBuild) ? json(outBuild) : undefined]) {
  if (previous?.version === version && previous.channel === 'production' && previous.sourceSha256 === sourceState(root) && !previous.sourceDirty) {
    const changed = capture('git', ['diff', '--name-only', previous.sourceCommit, head]).split('\n').filter(Boolean);
    const metadataOnly = changed.every(path => /^(?:\.github\/workflows\/|agent-log\/|docs\/|scripts\/smoke-[^/]+\.mjs$)/.test(path) || ['README.md', 'AGENTS.md', 'REQUIREMENTS.md', 'scripts/release.mjs', 'scripts/package-desktop.mjs', 'scripts/release-updates.test.mjs'].includes(path));
    if (metadataOnly) {
      run('git', ['merge-base', '--is-ancestor', previous.sourceCommit, head]);
      commit = previous.sourceCommit;
      console.log(`Reusing identical application source ${commit}; pipeline/main is ${head}.`);
      break;
    }
  }
}
const latest = JSON.parse(gh(['release', 'view', '--json', 'tagName']));
assert.notEqual(latest.tagName, tag, 'Never replace an already published version.');
const key = process.env.GITTOGETHER_TAURI_SIGNING_KEY || join(homedir(), '.config/gittogether/release/tauri-updater.key');
assert.ok(statSync(key).isFile() && !(statSync(key).mode & 0o077), 'Update signing key must remain private.');
assert.equal(readFileSync(key + '.pub', 'utf8').trim(), json(join(root, 'docs/release-updater.json')).plugins.updater.pubkey);
const reportValid = path => {
  if (!existsSync(path)) return false;
  const value = json(path);
  return value.build.sourceCommit === commit && value.build.sourceSha256 === sourceState(root) && !value.build.sourceDirty && value.assets.every(asset => existsSync(join(destination, asset.name)) && statSync(join(destination, asset.name)).size === asset.size && hash(join(destination, asset.name)) === asset.sha256);
};
if (!reportValid(join(destination, 'package-darwin-arm64.json'))) {
  run(process.execPath, ['scripts/desktop.mjs', 'check']);
  run(process.execPath, ['scripts/desktop.mjs', 'test']);
  const previous = existsSync(outBuild) ? json(outBuild) : undefined;
  if (!previous || previous.sourceCommit !== commit || previous.version !== version || previous.channel !== 'production' || previous.sourceDirty || previous.sourceSha256 !== sourceState(root)) run(process.execPath, ['scripts/desktop.mjs', 'release-build']);
  run(process.execPath, ['scripts/package-desktop.mjs']);
}
const mac = json(join(destination, 'package-darwin-arm64.json'));
assert.equal(mac.notarization.status, 'Accepted');
const app = join(mac.directory, 'GitTogether.app');
const nativeReceipt = join(destination, 'mac-native-validation.json');
const executableSha256 = hash(join(app, 'Contents/MacOS/gittogether'));
const resourcesSha256 = hash(join(app, 'Contents/_CodeSignature/CodeResources'));
const previousNative = existsSync(nativeReceipt) ? json(nativeReceipt) : undefined;
if (!previousNative || previousNative.sourceCommit !== mac.build.sourceCommit || previousNative.sourceSha256 !== mac.build.sourceSha256 || previousNative.executableSha256 !== executableSha256 || previousNative.resourcesSha256 !== resourcesSha256) {
  for (const script of ['smoke-desktop.mjs', 'smoke-commit-generation.mjs', 'smoke-repository-discovery.mjs']) {
    run(process.execPath, ['scripts/' + script], { env: { ...process.env, GITTOGETHER_SMOKE_APP: app, GITTOGETHER_SMOKE_EXECUTABLE: 'gittogether' } });
  }
  writeFileSync(nativeReceipt, JSON.stringify({ sourceCommit: mac.build.sourceCommit, sourceSha256: mac.build.sourceSha256, executableSha256, resourcesSha256, checks: 31 }, null, 2) + '\n');
}
const runFile = join(destination, 'windows-run.json');
let runId = existsSync(runFile) && json(runFile).commit === commit ? json(runFile).id : undefined;
if (!runId) {
  const started = Date.now();
  gh(['workflow', 'run', 'desktop-release-windows.yml', '--ref', 'main', '-f', `source_commit=${commit}`, '-f', `version=${version}`]);
  for (let attempt = 0; attempt < 12 && !runId; attempt++) {
    await pause(5000);
    const runs = JSON.parse(gh(['run', 'list', '--workflow', 'desktop-release-windows.yml', '--event', 'workflow_dispatch', '--limit', '8', '--json', 'databaseId,headSha,createdAt']));
    runId = runs.find(item => item.headSha === head && Date.parse(item.createdAt) >= started - 5000)?.databaseId;
  }
  assert.ok(runId, 'Could not locate the dispatched Windows release build.');
  writeFileSync(runFile, JSON.stringify({ commit, id: runId }) + '\n');
}
console.log(`Waiting for Windows release packages: https://github.com/${repository}/actions/runs/${runId}`);
for (let attempt = 0; ; attempt++) {
  const state = JSON.parse(gh(['run', 'view', String(runId), '--json', 'status,conclusion']));
  if (state.status === 'completed') { assert.equal(state.conclusion, 'success', 'Windows release packaging failed.'); break; }
  assert.ok(attempt < 180, 'Windows release packaging timed out.');
  await pause(15000);
}
const downloaded = join(destination, 'windows-download');
mkdirSync(downloaded, { recursive: true });
gh(['run', 'download', String(runId), '--pattern', 'desktop-release-*', '--dir', downloaded]);
for (const directory of readdirSync(downloaded)) for (const name of readdirSync(join(downloaded, directory))) copyFileSync(join(downloaded, directory, name), join(destination, name));
for (const arch of ['ia32', 'x64']) {
  assert.ok(reportValid(join(destination, `package-win32-${arch}.json`)), `Invalid Windows ${arch} provenance or package.`);
  const smoke = json(join(destination, `windows-smoke-${arch}.json`));
  assert.equal(smoke.sourceCommit, commit); assert.equal(smoke.arch, arch);
  for (const key of ['installed', 'encryptedStorage', 'originalCommitPush', 'fileAndIndexPreserved', 'productionUpdates']) assert.equal(smoke[key], true);
}
run('cargo', ['build', '--release', '--locked', '--manifest-path', 'tools/release-verify/Cargo.toml']);
const verifier = join(root, 'tools/release-verify/target/release/gittogether-release-verify');
const platforms = {};
const legacyAssets = [
  ['darwin-aarch64', `GitTogether-${version}-macOS-arm64.app.tar.gz`],
  ['windows-i686', `GitTogether-${version}-Windows-x86-setup.exe`],
  ['windows-x86_64', `GitTogether-${version}-Windows-x64-setup.exe`],
];
for (const [platform, name] of legacyAssets) {
  const path = join(destination, name);
  run(join(root, 'macos/node_modules/.bin/tauri'), ['signer', 'sign', '--private-key-path', key, '--password', '', '--app-version', version, path]);
  run(verifier, ['docs/release-updater.json', path, path + '.sig', version, platform]);
  platforms[platform] = { signature: readFileSync(path + '.sig', 'utf8').trim(), url: `https://github.com/${repository}/releases/download/${tag}/${name}` };
}
run('cargo', ['build', '--locked', '--manifest-path', 'tools/upgrade-fixture/Cargo.toml']);
run(process.execPath, ['scripts/smoke-updates.mjs']);
writeFileSync(join(destination, 'latest.json'), JSON.stringify({ version, notes: `GitTogether ${version}`, pub_date: new Date().toISOString(), platforms }, null, 2) + '\n');
const zipName = `GitTogether-${version}-mac-arm64.zip`;
const zipBytes = readFileSync(join(destination, zipName));
writeFileSync(join(destination, 'latest-mac.yml'), JSON.stringify({ version, files: [{ url: zipName, sha512: createHash('sha512').update(zipBytes).digest('base64'), size: zipBytes.length }], path: zipName, sha512: createHash('sha512').update(zipBytes).digest('base64'), releaseDate: new Date().toISOString() }, null, 2) + '\n');
writeFileSync(join(destination, 'changelog.json'), JSON.stringify([{ name: `GitTogether ${version}`, version, pub_date: new Date().toISOString(), notes: ['[New] 使用 GitHub Desktop 原版执行基础和 Material 界面。', '[Fixed] 恢复正式签名、公证发布以及旧版和新版自动更新。'] }], null, 2) + '\n');
const assets = [...mac.assets.map(item => item.name), ...['ia32', 'x64'].flatMap(arch => json(join(destination, `package-win32-${arch}.json`)).assets.map(item => item.name)), ...legacyAssets.map(([, name]) => name + '.sig'), 'latest.json', 'latest-mac.yml', 'changelog.json'];
const integrity = assets.map(name => ({ name, size: statSync(join(destination, name)).size, sha256: hash(join(destination, name)) }));
writeFileSync(join(destination, 'release-integrity.json'), JSON.stringify({ version, commit, pipelineCommit: head, notarization: mac.notarization, windowsRun: runId, assets: integrity }, null, 2) + '\n');
writeFileSync(join(destination, 'SHA256SUMS'), integrity.map(item => `${item.sha256}  ${item.name}`).join('\n') + '\n');
const notes = join(destination, 'release-notes.md');
writeFileSync(notes, `GitTogether ${version} 采用 GitHub Desktop 原版 Git、授权、凭据和后台执行基础，保留 GitTogether Material 界面、Submit、Clear、Get Latest 和 Presence。\n\n0.33.0 可在设置中检查、下载并升级；保留旧加密配置，首次启动通过原版存储导入支持的账号和存在的本地目录。无法读取时显示错误并保留原配置。新版继续使用原版自动更新器。\n\nmacOS Apple Silicon 已由 Developer ID 签名、Apple 公证并附加凭证。Windows 提供 x86/x64，旧版升级安装器提供更新签名；Windows 未配置 Authenticode 证书。32 位 Windows 的 Git 可用，供应商未提供该架构的 Copilot/Codex AI 运行时。\n\n源码 main：${commit}。\n`);
// Resume only our own unpublished draft, never overwrite a public release.
const releases = JSON.parse(gh(['release', 'list', '--limit', '30', '--json', 'tagName,isDraft']));
const existing = releases.find(item => item.tagName === tag);
if (existing) {
  assert.equal(existing.isDraft, true);
  assert.equal(JSON.parse(gh(['release', 'view', tag, '--json', 'targetCommitish'])).targetCommitish, commit, 'Draft belongs to a different source.');
}
else gh(['release', 'create', tag, '--target', commit, '--title', `GitTogether ${version}`, '--notes-file', notes, '--draft']);
gh(['release', 'upload', tag, ...[...assets, 'release-integrity.json', 'SHA256SUMS'].map(name => join(destination, name)), '--clobber']);
const remoteAssets = JSON.parse(gh(['release', 'view', tag, '--json', 'assets'])).assets;
for (const item of integrity) assert.ok(remoteAssets.some(asset => asset.name === item.name && asset.size === item.size), 'Draft asset missing or incomplete: ' + item.name);
assert.equal(capture('git', ['status', '--porcelain']), '', 'Unrelated work appeared during release.');
assert.equal(capture('git', ['rev-parse', 'HEAD']), head);
assert.equal(capture('git', ['ls-remote', 'origin', 'refs/heads/main']).split(/\s/)[0], head);
gh(['release', 'edit', tag, '--draft=false', '--latest']);
// Squirrel.Windows requires one architecture per RELEASES feed. Keep these
// tiny public feeds on main; payloads and tag still reference the release source.
assert.equal(capture('git', ['status', '--porcelain']), '', 'Unrelated work appeared during release.');
assert.equal(capture('git', ['rev-parse', 'HEAD']), head);
assert.equal(capture('git', ['ls-remote', 'origin', 'refs/heads/main']).split(/\s/)[0], head);
const feeds = [];
for (const arch of ['ia32', 'x64']) {
  const name = `GitTogether-${version}-win32-${arch}-full.nupkg`;
  const bytes = readFileSync(join(destination, name));
  const relative = `updates/win32-${arch}/RELEASES`;
  mkdirSync(join(root, 'updates', `win32-${arch}`), { recursive: true });
  writeFileSync(join(root, relative), `${createHash('sha1').update(bytes).digest('hex').toUpperCase()} https://github.com/${repository}/releases/download/${tag}/${name} ${bytes.length}\n`);
  feeds.push(relative);
}
run('git', ['add', '--', ...feeds]);
run('git', ['commit', '-m', `chore(DESKTOP-01-updates): publish ${version} Windows feeds [skip ci]`]);
run('git', ['push', 'origin', 'main']);
for (const relative of feeds) {
  for (let attempt = 0; ; attempt++) {
    const response = capture('curl', ['--location', '--silent', '--show-error', `https://raw.githubusercontent.com/${repository}/main/${relative}`]);
    if (response === readFileSync(join(root, relative), 'utf8').trim()) break;
    assert.ok(attempt < 32, 'Public Windows feed is stale: ' + relative);
    await pause(15000);
  }
}
assert.equal(JSON.parse(gh(['release', 'view', '--json', 'tagName'])).tagName, tag);
const temporary = mkdtempSync(join(tmpdir(), 'gittogether-public-release-'));
try {
  for (const item of integrity) {
    const path = join(temporary, item.name);
    run('curl', ['--fail', '--location', '--silent', '--show-error', '--retry', '2', '--output', path, `https://github.com/${repository}/releases/download/${tag}/${item.name}`]);
    assert.equal(statSync(path).size, item.size); assert.equal(hash(path), item.sha256);
  }
  for (const name of ['latest.json', 'latest-mac.yml']) {
    const value = JSON.parse(capture('curl', ['--fail', '--location', '--silent', '--show-error', `https://github.com/${repository}/releases/latest/download/${name}`]));
    assert.equal(value.version, version);
  }
  const atom = capture('curl', ['--fail', '--location', '--silent', '--show-error', `https://github.com/${repository}/releases.atom`]);
  assert.ok(atom.includes(`/releases/tag/${tag}`));
  for (const [platform, name] of legacyAssets) run(verifier, ['docs/release-updater.json', join(temporary, name), join(temporary, name + '.sig'), version, platform]);
} finally { rmSync(temporary, { recursive: true, force: true }); }
run(process.execPath, ['scripts/smoke-updates.mjs', '--public']);
for (let attempt = 0; ; attempt++) {
  const response = capture('curl', ['--location', '--silent', '--show-error', '--max-time', '30', 'https://update.electronjs.org/DDonlien/git-together/darwin-arm64/0.33.0']);
  let feed;
  try { feed = JSON.parse(response) } catch (error) { if (!(error instanceof SyntaxError)) throw error }
  if (feed?.url === `https://github.com/${repository}/releases/download/${tag}/${zipName}`) break;
  assert.ok(attempt < 60, 'Electron public update feed has not reached the released package.');
  await pause(15000);
}
writeFileSync(join(destination, 'public-validation.json'), JSON.stringify({ version, commit, verifiedAt: new Date().toISOString(), assets: integrity.length, latest: true, atom: true, signatures: true, completeDownloads: true }, null, 2) + '\n');
console.log(`Published and verified https://github.com/${repository}/releases/tag/${tag}`);
