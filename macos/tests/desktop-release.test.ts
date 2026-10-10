import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { notarizationResult, reconcileReleaseMutation, verifyReleaseAssets, verifyUpdateMetadata, type ReleasePackage } from '../scripts/desktop-release';

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
  assert.match(source, /tag_name: tag, target_commitish: sourceCommit, draft: true/);
  assert.match(source, /verifyReleaseAssets\(uploaded.assets, expected\)/);
  assert.match(source, /draft: false, prerelease: false, make_latest: 'true'/);
  assert.match(source, /await assertTag\(false\)/);
  assert.match(source, /publicRead\(feedUrl,/);
  assert.match(source, /update\(bytes\).digest\('base64'\) !== artifact.sha512/);
  assert.doesNotMatch(source, /NODE_TLS_REJECT_UNAUTHORIZED|--insecure|rejectUnauthorized:\s*false|GH_TOKEN:.*console/);
});

test('an already completed release mutation is not replayed', async () => {
  let writes = 0;
  await reconcileReleaseMutation(async () => { writes++; }, async () => true, async () => {});
  assert.equal(writes, 0);
});

test('a lost success response is recovered by readback without duplicate writes', async () => {
  let writes = 0, complete = false, waits = 0;
  await reconcileReleaseMutation(async () => {
    writes++; complete = true; throw new TypeError('fetch failed');
  }, async () => complete, async () => { waits++; });
  assert.equal(writes, 1);
  assert.equal(waits, 0);
});

test('a confirmed incomplete mutation can retry after a transient connection failure', async () => {
  let writes = 0, complete = false, waits = 0;
  await reconcileReleaseMutation(async () => {
    writes++;
    if (writes === 1) throw new TypeError('fetch failed');
    complete = true;
  }, async () => complete, async () => { waits++; });
  assert.equal(writes, 2);
  assert.equal(waits, 1);
});

test('release mutation retries are bounded and preserve the final error', async () => {
  let writes = 0, reads = 0, waits = 0;
  const failure = new TypeError('fetch failed');
  await assert.rejects(reconcileReleaseMutation(async () => { writes++; throw failure; },
    async () => { reads++; return false; }, async () => { waits++; }), error => error === failure);
  assert.equal(writes, 3);
  assert.equal(reads, 6);
  assert.equal(waits, 2);
});

test('permanent release failures are not retried', async () => {
  let writes = 0, reads = 0;
  const failure = new Error('permission denied');
  await assert.rejects(reconcileReleaseMutation(async () => { writes++; throw failure; },
    async () => { reads++; return false; }, async () => {}), error => error === failure);
  assert.equal(writes, 1);
  assert.equal(reads, 1);
});

test('a changed protected draft during recovery prevents replay', async () => {
  let writes = 0;
  await assert.rejects(reconcileReleaseMutation(async () => { writes++; throw new TypeError('fetch failed'); }, async () => {
    if (writes) throw new Error('draft no longer belongs to this source');
    return false;
  }, async () => {}), /draft no longer belongs/);
  assert.equal(writes, 1);
});

test('successful writes still require a verified readback', async () => {
  let writes = 0;
  await assert.rejects(reconcileReleaseMutation(async () => { writes++; }, async () => false, async () => {}), /服务器状态未通过核对/);
  assert.equal(writes, 1);
});

test('acknowledged writes wait for delayed visibility without replaying', async () => {
  let writes = 0, reads = 0, waits = 0;
  await reconcileReleaseMutation(async () => { writes++; }, async () => ++reads >= 3, async () => { waits++; });
  assert.equal(writes, 1);
  assert.equal(reads, 3);
  assert.equal(waits, 1);
});

test('public verification remains reusable and gives complete ZIP transfers a bounded deadline', () => {
  const source = readFileSync(new URL('../scripts/desktop-release.ts', import.meta.url), 'utf8');
  assert.match(source, /return verifyPublicDesktopRelease\(artifact\)/);
  assert.match(source, /export async function verifyPublicDesktopRelease/);
  assert.match(source, /commit.sha !== artifact.sourceCommit/);
  assert.match(source, /'--max-time', '900'/);
  assert.match(source, /'--proto-redir', '=https'/);
  assert.match(source, /bytes.length !== artifact.size/);
  assert.match(source, /finally.*await rm\(temporary/);
});

test('public feed and metadata checks use bounded macOS HTTPS requests with response status', () => {
  const source = readFileSync(new URL('../scripts/desktop-release.ts', import.meta.url), 'utf8');
  const read = source.slice(source.indexOf('async function publicRead('), source.indexOf('export async function prepareDesktopRelease('));
  assert.match(read, /promisify\(execFile\)\('\/usr\/bin\/curl'/);
  assert.match(read, /'--proto', '=https', '--proto-redir', '=https'/);
  assert.match(read, /'--max-time', '180'/);
  assert.match(read, /'--write-out', '\\n%\{http_code\}'/);
  assert.match(read, /new Response\(stdout.slice\(0, separator\), \{ status \}\)/);
  assert.match(read, /status < 100 \|\| status > 599/);
  assert.doesNotMatch(read, /await fetch\(/);
});
