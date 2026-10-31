import test from 'node:test';
import assert from 'node:assert/strict';
import { isBranches, isCommitPage, isIntegrationPlan, isIntegrationResult } from '../src/integration-model';
const sha = 'a'.repeat(40);
const branches = { branches: [{ name: 'main', head: sha }], limited: false, remote: 'origin', pushRemote: 'origin', pushError: null };
const page = { branch: 'main', head: sha, localHead: sha, page: 0, commits: [{ id: sha, summary: 'commit' }], hasMore: false, bases: [sha], ahead: 1, behind: 1 };
const plan = { id: 'id', repositoryId: 'repo', taskId: 'task', mode: 'rebase', path: '/path', branch: 'main', head: sha, remote: 'origin', pushRemote: null, remoteBranch: 'main', remoteHead: sha, targetCommit: sha, base: sha, replay: [{ id: sha, summary: 'local' }], resultHead: sha, files: [], patch: '', resolvedConflicts: [], summary: '', description: '', unchanged: false };
test('integration payloads require exact identities, bounded lists and valid hashes', () => {
  assert.equal(isBranches(branches), true); assert.equal(isBranches({ ...branches, branches: [{ name: 'main', head: 'invalid' }] }), false);
  assert.equal(isCommitPage(page), true); assert.equal(isCommitPage({ ...page, ahead: -1 }), false); assert.equal(isCommitPage({ ...page, page: 10 }), false);
  assert.equal(isIntegrationPlan(plan), true); assert.equal(isIntegrationPlan({ ...plan, targetCommit: 'HEAD' }), false); assert.equal(isIntegrationPlan({ ...plan, mode: 'other' }), false);
  assert.equal(isIntegrationResult({ status: 'rebased', taskId: 'task', head: sha, branch: 'main', recoveryRef: 'refs/gittogether/recovery/id' }), true);
  assert.equal(isIntegrationResult({ status: 'pushed', taskId: 'task', head: sha, branch: 'main', commitId: 'bad' }), false);
});
