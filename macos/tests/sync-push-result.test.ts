import test from 'node:test';
import assert from 'node:assert/strict';
import { isExpectedPushResult } from '../src/local-submit-model';
import { isRepositorySyncPlan } from '../src/repository-sync-model';

const original = 'a'.repeat(40), merged = 'b'.repeat(40);
const input = { taskId: 'task', commitId: original, expectedHead: original };
const result = { taskId: 'task', branch: 'main', pushed: true, commitId: original };

test('push accepts a new merge head only for the originally selected current head', () => {
  assert.equal(isExpectedPushResult(result, input), true);
  assert.equal(isExpectedPushResult({ ...result, commitId: merged, requestedCommitId: original }, input), true);
  assert.equal(isExpectedPushResult({ ...result, commitId: merged }, input), false);
  assert.equal(isExpectedPushResult({ ...result, commitId: merged, requestedCommitId: merged }, input), false);
  assert.equal(isExpectedPushResult({ ...result, commitId: merged, requestedCommitId: original }, { ...input, expectedHead: merged }), false);
  assert.equal(isExpectedPushResult({ ...result, taskId: 'other', commitId: merged, requestedCommitId: original }, input), false);
});

test('pull preview accepts known integration kinds and rejects unknown kinds', () => {
  const plan = { id: 'id', repositoryId: 'repo', taskId: 'task', mode: 'pull', path: '/tmp/repo', branch: 'main', head: original, remoteHead: merged, files: [], historyCommits: 0, protectedHistory: false, note: '合并' };
  for (const integration of ['merge', 'fast-forward', 'up-to-date']) assert.equal(isRepositorySyncPlan({ ...plan, integration }), true);
  assert.equal(isRepositorySyncPlan({ ...plan, integration: 'unknown' }), false);
});
