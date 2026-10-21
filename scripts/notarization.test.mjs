import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classifyNotaryFailure, readNotaryConfiguration, notarizationProgress } from './notarization.mjs';

test('Apple NoItem does not establish missing credentials, and locked requires system evidence', () => {
  const message = 'Error: No Keychain password item found for profile: gittogether-notary';
  assert.equal(classifyNotaryFailure(69, message), 'profile-temporarily-unavailable');
  assert.equal(classifyNotaryFailure(69, message, true), 'data-protection-locked');
  assert.equal(classifyNotaryFailure(1, 'HTTP 401: Invalid credentials'), 'authentication-rejected');
  assert.equal(classifyNotaryFailure(1, 'SotoS3 abortedUpload: HTTPClientError.connectTimeout'), 'upload-network');
  assert.equal(classifyNotaryFailure(1, 'submission Invalid'), 'notary-failed');
});

test('existing profile location remains unchanged and profile override does not reuse another keychain', () => {
  const directory = mkdtempSync(join(tmpdir(), 'gittogether-notary-config-'));
  const path = join(directory, 'notary.json');
  const original = '{"version":1,"profile":"saved-profile","keychain":"/tmp/test.keychain-db"}\n';
  try {
    writeFileSync(path, original, { mode: 0o600 });
    assert.deepEqual(readNotaryConfiguration(path, {}), { version: 1, profile: 'saved-profile', keychain: '/tmp/test.keychain-db' });
    assert.deepEqual(readNotaryConfiguration(path, { GITTOGETHER_NOTARY_PROFILE: 'other-profile' }), { version: 1, profile: 'other-profile' });
    assert.deepEqual(readNotaryConfiguration(path, { GITTOGETHER_NOTARY_KEYCHAIN: '/tmp/explicit.keychain-db' }), { version: 1, profile: 'saved-profile', keychain: '/tmp/explicit.keychain-db' });
    assert.equal(readFileSync(path, 'utf8'), original);
    assert.throws(() => readNotaryConfiguration(path, { GITTOGETHER_NOTARY_KEYCHAIN: 'relative.keychain' }), /定位无效/);
    chmodSync(path, 0o644);
    assert.throws(() => readNotaryConfiguration(path, {}), /当前用户可读/);
    chmodSync(path, 0o600);
    writeFileSync(path, '{"version":1,"profile":"saved-profile","password":"must-not-be-here"}');
    assert.throws(() => readNotaryConfiguration(path, {}), /禁止在配置中保存密码/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('job creation, successful upload, and Apple acceptance are separate checkpoints', () => {
  const id = '2a764857-7295-4b45-8569-34f7a8e99ae3';
  const created = `Conducting pre-submission checks\nSubmission ID received\n  id: ${id}\n`;
  assert.deepEqual(notarizationProgress(created), { id, status: undefined, uploaded: false });
  const uploaded = created + 'Successfully uploaded file\nWaiting for processing to complete.\n';
  assert.deepEqual(notarizationProgress(uploaded), { id, status: undefined, uploaded: true });
  assert.deepEqual(notarizationProgress(uploaded + `  id: ${id}\n  status: Accepted\n`), { id, status: 'Accepted', uploaded: true });
  assert.equal(notarizationProgress(created + '  status: Invalid\n').status, 'Invalid');
});
