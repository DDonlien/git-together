import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommitDraftStore, generationIdentity, type SavedDraft } from '../src/commit-draft-store';
import type { GenerateCommitMessage } from '../src/local-submit-model';

const saved = (): SavedDraft => ({ draft: { summary: '', description: '' }, edited: { summary: false, description: false }, generated: false, head: 'a'.repeat(40), changeKey: 'b'.repeat(64), paths: ['one.txt', 'two.txt'] });
const input = () => ({ repositoryId: 'fixture:1', taskId: 'worktree:main:fixture', expectedHead: saved().head, changeKey: saved().changeKey!, paths: saved().paths });
const result = { summary: '生成的摘要', description: '生成的正文' };
function deferred() { let resolve!: (value: typeof result) => void; const promise = new Promise<typeof result>(done => { resolve = done; }); return { promise, resolve }; }

test('opening and reading a draft do not create a generation request', () => {
  const store = createCommitDraftStore();
  assert.equal(store.getJob('task', saved()), undefined);
  assert.equal(store.drafts.size, 0);
  assert.equal(store.snapshot(), 0);
});

test('a pending job survives dialog absence and a second reader reuses its request', async () => {
  const store = createCommitDraftStore(), pending = deferred(); let calls = 0;
  const request: GenerateCommitMessage = async () => { calls++; return pending.promise; };
  const first = store.generate('task', saved(), input(), request);
  assert.equal(store.getJob('task', saved())?.status, 'running');
  const second = store.generate('task', saved(), input(), request);
  assert.equal(second, first); assert.equal(calls, 1);
  pending.resolve(result); await first;
  assert.deepEqual(store.drafts.get('task')?.draft, result);
  assert.equal(store.drafts.get('task')?.generated, true);
  assert.equal(store.getJob('task', saved())?.status, 'completed');
});

test('completion keeps fields edited while the background request was running', async () => {
  const store = createCommitDraftStore(), pending = deferred();
  const request = store.generate('task', saved(), input(), async () => pending.promise);
  store.drafts.set('task', { ...saved(), draft: { summary: '手工摘要', description: '' }, edited: { summary: true, description: true } });
  pending.resolve(result); await request;
  assert.deepEqual(store.drafts.get('task')?.draft, { summary: '手工摘要', description: '' });
});

test('a changed HEAD, change fingerprint or selected file set cannot reuse a job', async () => {
  const store = createCommitDraftStore();
  await store.generate('task', saved(), input(), async () => result);
  for (const change of [{ head: 'c'.repeat(40) }, { changeKey: 'd'.repeat(64) }, { paths: ['one.txt'] }]) {
    assert.equal(store.getJob('task', { ...saved(), ...change }), undefined);
  }
  assert.equal(generationIdentity({ ...saved(), paths: ['two.txt', 'one.txt'] }), generationIdentity(saved()));
});

test('a stale completion never overwrites the newly selected object', async () => {
  const store = createCommitDraftStore(), pending = deferred();
  const request = store.generate('task', saved(), input(), async () => pending.promise);
  const changed = { ...saved(), paths: ['one.txt'], draft: { summary: '新范围', description: '' } };
  store.drafts.set('task', changed);
  pending.resolve(result); await request;
  assert.deepEqual(store.drafts.get('task'), changed);
});

test('failure is preserved for reopen and retry starts a fresh request', async () => {
  const store = createCommitDraftStore();
  await assert.rejects(store.generate('task', saved(), input(), async () => { throw new Error('真实失败'); }), /真实失败/);
  assert.equal(store.getJob('task', saved())?.error, '真实失败');
  await store.generate('task', saved(), input(), async () => result);
  assert.equal(store.getJob('task', saved())?.status, 'completed');
});

test('explicit stop cancels only the selected job and releases its refresh pause', async () => {
  const store = createCommitDraftStore(); let paused = 0;
  const request: GenerateCommitMessage = async (_input, signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  const first = store.generate('first', saved(), input(), request, () => { paused++; return () => { paused--; }; });
  const second = store.generate('second', saved(), input(), request, () => { paused++; return () => { paused--; }; });
  store.cancel('first'); await assert.rejects(first, { name: 'AbortError' });
  assert.equal(paused, 1); assert.equal(store.getJob('second', saved())?.status, 'running');
  store.stop(); await assert.rejects(second, { name: 'AbortError' }); assert.equal(paused, 0);
  assert.equal(store.drafts.get('first')?.generated, false);
});
