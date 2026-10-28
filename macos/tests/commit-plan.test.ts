import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommitDraftStore, type SavedDraft } from '../src/commit-draft-store';
import { isCommitPlan, type CommitPlan } from '../src/local-submit-model';

const saved = (): SavedDraft => ({ draft: { summary: 'my draft', description: '' }, edited: { summary: true, description: false }, generated: false, head: 'head', changeKey: 'change', paths: ['a', 'b'] });
const input = { repositoryId: 'repo', taskId: 'task', expectedHead: 'head', changeKey: 'change', paths: ['a', 'b'] };
const plan: CommitPlan = { groups: [{ summary: 'A', description: '', paths: ['a'] }, { summary: 'B', description: '', paths: ['b'] }] };

test('AI plan must cover each selected file exactly once', () => {
  assert.equal(isCommitPlan(plan, ['a', 'b']), true);
  assert.equal(isCommitPlan({ groups: [plan.groups[0]] }, ['a', 'b']), false);
  assert.equal(isCommitPlan({ groups: [{ summary: 'A', description: '', paths: ['a', 'a'] }] }, ['a', 'b']), false);
  assert.equal(isCommitPlan({ groups: [{ summary: 'A', description: '', paths: ['a', 'other'] }] }, ['a', 'b']), false);
});

test('generated groups preserve the manual draft and do not apply to a changed selection', async () => {
  const store = createCommitDraftStore();
  let resolve!: (value: CommitPlan) => void;
  const pending = store.generatePlan('key', saved(), input, () => new Promise(done => { resolve = done; }));
  assert.equal(store.getJob('key', saved())?.status, 'running');
  resolve(plan);
  await pending;
  assert.equal(store.drafts.get('key')?.draft.summary, 'my draft');
  assert.deepEqual(store.drafts.get('key')?.plan, plan.groups);

  let resolveStale!: (value: CommitPlan) => void;
  const stale = store.generatePlan('key', saved(), input, () => new Promise(done => { resolveStale = done; }));
  store.drafts.set('key', { ...saved(), paths: ['a'] });
  resolveStale(plan);
  await stale;
  assert.equal(store.drafts.get('key')?.plan, undefined);
});
