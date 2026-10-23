import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { downloadPublicAssets } from './release-downloads.mjs';

const root = join(import.meta.dirname, '..');
const repository = 'DDonlien/git-together';
const version = process.env.GITTOGETHER_RELEASE_VERSION;
const sourceCommit = process.env.GITTOGETHER_SOURCE_COMMIT;
assert.match(version || '', /^\d+\.\d+\.\d+$/);
assert.match(sourceCommit || '', /^[0-9a-f]{40}$/i);
const tag = `v${version}`;
const destination = join(root, 'artifacts/releases', version);
mkdirSync(destination, { recursive: true });
const run = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, stdio: 'inherit', env: { ...process.env, GODEBUG: 'http2client=0' } });
const capture = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, GODEBUG: 'http2client=0' } }).trim();
const gh = args => capture('gh', [...args, '--repo', repository]);
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const assertSourceOnMain = () => {
  run('git', ['fetch', 'origin', 'main', '--no-tags']);
  run('git', ['merge-base', '--is-ancestor', sourceCommit, 'FETCH_HEAD']);
};

const release = JSON.parse(gh(['api', `repos/${repository}/releases/tags/${tag}`]));
assert.equal(release.draft, false);
assert.equal(release.target_commitish, sourceCommit);
const integrityPath = join(destination, 'release-integrity.json');
if (!existsSync(integrityPath)) gh(['release', 'download', tag, '--pattern', 'release-integrity.json', '--dir', destination]);
const integrity = json(integrityPath);
assert.equal(integrity.version, version);
assert.equal(integrity.commit, sourceCommit);
const requiredNames = [`GitTogether-${version}-win32-ia32-full.nupkg`, `GitTogether-${version}-win32-x64-full.nupkg`];
const checksumPath = join(destination, 'SHA256SUMS');
if (!existsSync(checksumPath)) gh(['release', 'download', tag, '--pattern', 'SHA256SUMS', '--dir', destination]);
const checksumRows = readFileSync(checksumPath, 'utf8').trim().split('\n').map(line => {
  const match = /^([a-f\d]{64})  (.+)$/.exec(line);
  assert.ok(match, 'Published SHA256SUMS contains an invalid line.');
  return { sha256: match[1], name: match[2] };
});
const publicFiles = [...integrity.assets];
for (const item of integrity.assets) {
  const checksum = checksumRows.find(entry => entry.name === item.name);
  assert.ok(checksum, `SHA256SUMS does not list ${item.name}.`);
  assert.equal(checksum.sha256, item.sha256, `SHA256SUMS does not match ${item.name}.`);
}
for (const name of ['release-integrity.json', 'SHA256SUMS']) {
  const asset = release.assets.find(item => item.name === name);
  assert.ok(asset && asset.state === 'uploaded' && /^sha256:[a-f\d]{64}$/i.test(asset.digest || ''), `Published release is missing a verifiable ${name}.`);
  publicFiles.push({ name, size: asset.size, sha256: asset.digest.slice('sha256:'.length) });
}
for (const name of requiredNames) {
  const item = integrity.assets.find(asset => asset.name === name);
  assert.ok(item, `Release integrity report is missing ${name}.`);
  const path = join(destination, name);
  if (!existsSync(path)) gh(['release', 'download', tag, '--pattern', name, '--dir', destination]);
  assert.equal(statSync(path).size, item.size, `${name} has the wrong size.`);
  assert.equal(hash(path), item.sha256, `${name} does not match the release integrity report.`);
}
const verification = mkdtempSync(join(tmpdir(), 'gittogether-metadata-assets-'));
try {
  await downloadPublicAssets(publicFiles, version, verification);
  for (const item of publicFiles) assert.equal(hash(join(verification, item.name)), item.sha256, `${item.name} failed public download verification.`);
} finally { rmSync(verification, { recursive: true, force: true }); }

const feedContents = new Map();
for (const arch of ['ia32', 'x64']) {
  const name = `GitTogether-${version}-win32-${arch}-full.nupkg`;
  const bytes = readFileSync(join(destination, name));
  feedContents.set(`updates/win32-${arch}/RELEASES`, `${createHash('sha1').update(bytes).digest('hex').toUpperCase()} https://github.com/${repository}/releases/download/${tag}/${name} ${bytes.length}\n`);
}
const versionFiles = ['package.json', 'macos/package.json', 'desktop/app/package.json', 'macos/package-lock.json', 'desktop/gittogether-presence/Cargo.toml', 'desktop/gittogether-presence/Cargo.lock'];
const publishMetadata = metadataRoot => {
  const compareVersion = (left, right) => {
    const a = left.split('.').map(Number), b = right.split('.').map(Number);
    for (let index = 0; index < 3; index++) if (a[index] !== b[index]) return a[index] - b[index];
    return 0;
  };
  const setJsonVersion = relative => {
    const path = join(metadataRoot, relative), value = json(path);
    if (compareVersion(value.version, version) <= 0) value.version = version;
    if (relative === 'macos/package-lock.json' && value.packages?.[''] && compareVersion(value.packages[''].version, version) <= 0) value.packages[''].version = version;
    writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
  };
  for (const relative of ['package.json', 'macos/package.json', 'desktop/app/package.json', 'macos/package-lock.json']) setJsonVersion(relative);
  const manifest = join(metadataRoot, 'desktop/gittogether-presence/Cargo.toml');
  let text = readFileSync(manifest, 'utf8');
  text = text.replace(/(^\[package\][\s\S]*?^version = ")([^"]+)(")/m, (whole, prefix, current, suffix) => compareVersion(current, version) <= 0 ? prefix + version + suffix : whole);
  writeFileSync(manifest, text);
  const cargoLock = join(metadataRoot, 'desktop/gittogether-presence/Cargo.lock');
  text = readFileSync(cargoLock, 'utf8');
  text = text.replace(/(\[\[package\]\]\nname = "gittogether-presence"\nversion = ")([^"]+)(")/, (whole, prefix, current, suffix) => compareVersion(current, version) <= 0 ? prefix + version + suffix : whole);
  writeFileSync(cargoLock, text);
  for (const [relative, content] of feedContents) {
    const path = join(metadataRoot, relative);
    mkdirSync(join(metadataRoot, 'updates', relative.split('/')[1]), { recursive: true });
    writeFileSync(path, content);
  }
};

const metadataParent = mkdtempSync(join(tmpdir(), 'gittogether-release-main-'));
const metadataRoot = join(metadataParent, 'checkout');
let metadataPublished = false;
try {
  for (let attempt = 0; attempt < 6 && !metadataPublished; attempt++) {
    assertSourceOnMain();
    const mainCommit = capture('git', ['rev-parse', 'FETCH_HEAD']);
    if (attempt === 0) run('git', ['worktree', 'add', '--detach', metadataRoot, mainCommit]);
    else run('git', ['reset', '--hard', mainCommit], metadataRoot);
    publishMetadata(metadataRoot);
    run('git', ['add', '--', ...versionFiles, ...feedContents.keys()], metadataRoot);
    const changed = capture('git', ['status', '--porcelain'], metadataRoot);
    if (changed) run('git', ['-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', 'commit', '-m', `chore(release): publish ${version} package metadata [skip ci]`], metadataRoot);
    const pushed = spawnSync('git', ['push', 'origin', 'HEAD:refs/heads/main'], { cwd: metadataRoot, encoding: 'utf8', env: { ...process.env, GODEBUG: 'http2client=0' } });
    if (pushed.status === 0) metadataPublished = true;
    else if (!/non-fast-forward|fetch first|rejected/i.test((pushed.stdout || '') + (pushed.stderr || '')) || attempt === 5) {
      throw new Error(`Could not publish release metadata: ${((pushed.stderr || pushed.stdout || '').trim()).slice(0, 1000)}`);
    }
  }
} finally {
  if (existsSync(metadataRoot)) run('git', ['worktree', 'remove', '--force', metadataRoot]);
  rmSync(metadataParent, { recursive: true, force: true });
}
assert.ok(metadataPublished, 'Release metadata was not pushed to main.');
for (const [relative, content] of feedContents) {
  for (let attempt = 0; ; attempt++) {
    const response = capture('curl', ['--location', '--silent', '--show-error', `https://raw.githubusercontent.com/${repository}/main/${relative}`]);
    if (response === content.trim()) break;
    assert.ok(attempt < 32, 'Public Windows feed is stale: ' + relative);
    await new Promise(resolve => setTimeout(resolve, 15000));
  }
}
console.log(`Published Windows feeds and ${version} baseline metadata to main.`);
