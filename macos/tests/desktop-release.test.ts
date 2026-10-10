import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { notarizationResult, verifyReleaseAssets, verifyUpdateMetadata, type ReleasePackage } from '../scripts/desktop-release';

const artifact: ReleasePackage = {
  version: '0.17.2', sourceCommit: 'a'.repeat(40), zipPath: '/build/GitTogether-0.17.2-macOS-arm64.zip',
  updateMetadataPath: '/build/latest-mac.yml', sha256: 'b'.repeat(64), sha512: 'checksum', size: 123, notarized: true,
};
const metadata = () => ({ version: artifact.version, path: 'GitTogether-0.17.2-macOS-arm64.zip', sha512: artifact.sha512,
  files: [{ url: 'GitTogether-0.17.2-macOS-arm64.zip', sha512: artifact.sha512, size: artifact.size }] });

test('notarization must explicitly be Accepted before stapling or publication', () => {
  assert.deepEqual(notarizationResult('{"id":"submission","status":"Accepted"}'), { id: 'submission', status: 'Accepted' });
  for (const status of ['Invalid', 'In Progress', 'Rejected']) assert.throws(() => notarizationResult(JSON.stringify({ id: 'submission', status })), /公证未通过/);
  assert.throws(() => notarizationResult('{"status":"Accepted"}'), /公证未通过/);
  assert.throws(() => notarizationResult('{}'), /公证未通过/);
});

test('draft assets require exact names, uploaded state, sizes and SHA-256 digests', () => {
  const expected = [{ name: 'app.zip', size: 123, sha256: artifact.sha256 }];
  const uploaded = { name: 'app.zip', size: 123, digest: `sha256:${artifact.sha256}`, state: 'uploaded' };
  verifyReleaseAssets([uploaded], expected);
  for (const changed of [{ name: 'other.zip' }, { size: 122 }, { digest: null }, { digest: 'sha256:wrong' }, { state: 'starter' }]) {
    assert.throws(() => verifyReleaseAssets([{ ...uploaded, ...changed }], expected), /未完整上传或校验值不符/);
  }
  assert.throws(() => verifyReleaseAssets([], expected));
  assert.throws(() => verifyReleaseAssets([uploaded, uploaded], expected));
});

test('public update metadata must identify the exact final notarized ZIP', () => {
  verifyUpdateMetadata(metadata(), artifact);
  for (const changed of [{ version: '0.10.1' }, { path: 'other.zip' }, { sha512: 'wrong' }, { files: [] }, { files: [{ ...metadata().files[0], size: 122 }] }, { files: [{ ...metadata().files[0], sha512: 'wrong' }] }]) {
    assert.throws(() => verifyUpdateMetadata({ ...metadata(), ...changed }, artifact), /更新清单.*不一致/);
  }
  assert.throws(() => verifyUpdateMetadata(null, artifact));
});

test('the existing desktop package entry always validates, notarizes and publishes', () => {
  const source = readFileSync(new URL('../scripts/package-desktop.ts', import.meta.url), 'utf8');
  assert.match(source, /GITTOGETHER_NOTARY_PROFILE \|\| 'gittogether-notary'/);
  assert.doesNotMatch(source, /if \(process\.env\.GITTOGETHER_NOTARY_PROFILE\)/);
  assert.match(source, /prepareDesktopRelease\(clientRoot, manifest.version, sourceCommit\)/);
  assert.match(source, /await run\('npm', \['run', 'check'\]/);
  assert.match(source, /await run\('npm', \['test'\]/);
  assert.match(source, /notarizationResult\(submission.stdout\)/);
  assert.match(source, /'stapler', 'validate'/);
  assert.match(source, /release.publish\(\{ \.\.\.result, size: bytes.length \}\)/);
  assert.match(source, /await mkdir\(releaseLock\)/);
  assert.match(source, /await rm\(releaseLock/);
});

test('publication protects main provenance and exposes only verified stable assets', () => {
  const source = readFileSync(new URL('../scripts/desktop-release.ts', import.meta.url), 'utf8');
  assert.match(source, /main\?\.object.sha !== sourceCommit/);
  assert.match(source, /existing && \(!existing.draft \|\| existing.target_commitish !== sourceCommit\)/);
  assert.match(source, /'--draft', '--target', sourceCommit/);
  assert.match(source, /verifyReleaseAssets\(uploaded.assets, expected\)/);
  assert.match(source, /'--draft=false', '--prerelease=false', '--latest'/);
  assert.match(source, /await assertTag\(false\)/);
  assert.match(source, /publicRead\(`https:\/\/github.com\/\$\{repository\}\/releases.atom`\)/);
  assert.match(source, /sha512.digest\('base64'\) !== artifact.sha512/);
  assert.doesNotMatch(source, /NODE_TLS_REJECT_UNAUTHORIZED|--insecure|rejectUnauthorized:\s*false|GH_TOKEN:.*console/);
});
