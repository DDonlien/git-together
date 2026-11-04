import test from 'node:test';
import assert from 'node:assert/strict';
import { canGenerateCommitDraft, generateCommitDrafts } from '../src/generate-commit-drafts';
import type { CommitDraft, GenerateCommitMessage } from '../src/local-submit-model';
import type { RepositoryActionTarget } from '../src/repository-action-model';

type Entry = RepositoryActionTarget & { paths: string[]; complete?: boolean };
const draft: CommitDraft = { summary: 'Generated summary', description: 'Generated description' };
function entry(repositoryId: string, options: Partial<Entry> = {}): Entry {
  return {
    repositoryId, repositoryName: `fixture/${repositoryId}`,
    task: { id: `${repositoryId}:main`, branch: 'main', head: 'a'.repeat(40), changeKey: 'b'.repeat(64), path: `/fixture/${repositoryId}`, files: [{ path: 'selected.ts', status: 'M', tracked: true }, { path: 'excluded.ts', status: 'M', tracked: true }], tree: [], error: '' },
    paths: ['selected.ts'], ...options,
  };
}

test('mixed providers generate for GitHub and other selected worktrees, skipping completed and unselected ones', async () => {
  const entries = [
    entry('gitea', { paths: ['selected.ts', 'docs/selected notes.md'] }),
    entry('github'),
    entry('enterprise'),
    entry('gitlab'),
    entry('gitee', { complete: true }),
    entry('empty', { paths: [] }),
  ];
  const controller = new AbortController(), events: string[] = [];
  const generate: GenerateCommitMessage = async (input, signal) => {
    events.push(`generate:${input.repositoryId}`);
    const target = entries.find(target => target.repositoryId === input.repositoryId)!;
    assert.deepEqual(input, { repositoryId: target.repositoryId, taskId: target.task.id, expectedHead: target.task.head, changeKey: target.task.changeKey, paths: target.paths });
    assert.equal(signal, controller.signal);
    return draft;
  };
  await generateCommitDrafts(entries, generate, controller.signal, index => events.push(`start:${index}`), (index, result) => { events.push(`draft:${index}`); assert.deepEqual(result, draft); });
  assert.deepEqual(events, ['start:0', 'generate:gitea', 'draft:0', 'start:1', 'generate:github', 'draft:1', 'start:2', 'generate:enterprise', 'draft:2', 'start:3', 'generate:gitlab', 'draft:3']);
});

test('fully populated drafts are skipped and partial or absent drafts retain hand-authored fields', async () => {
  const entries = [
    entry('complete-draft', { draft: { summary: 'Written summary', description: 'Written description' } }),
    entry('summary-only', { draft: { summary: '  Written summary  ', description: '  ' } }),
    entry('description-only', { draft: { summary: '', description: 'Written description' } }),
    entry('absent-draft'),
  ];
  assert.deepEqual(entries.map(canGenerateCommitDraft), [false, true, true, true]);
  const starts: number[] = [], results: [number, CommitDraft][] = [];
  await generateCommitDrafts(entries, async () => draft, new AbortController().signal, index => starts.push(index), (index, value) => results.push([index, value]));
  assert.deepEqual(starts, [1, 2, 3]);
  assert.deepEqual(results, [
    [1, { summary: '  Written summary  ', description: draft.description }],
    [2, { summary: draft.summary, description: 'Written description' }],
    [3, draft],
  ]);
  assert.deepEqual(entries[1].draft, { summary: '  Written summary  ', description: '  ' });
});

test('generation waits for each worktree before starting the next one', async () => {
  let release!: (value: CommitDraft) => void;
  const first = new Promise<CommitDraft>(resolve => { release = resolve; });
  const calls: string[] = [], starts: number[] = [], results: number[] = [];
  const running = generateCommitDrafts([entry('first'), entry('second')], async input => { calls.push(input.repositoryId); return input.repositoryId === 'first' ? first : draft; }, new AbortController().signal, index => starts.push(index), index => results.push(index));
  assert.deepEqual(calls, ['first']);
  assert.deepEqual(starts, [0]);
  assert.deepEqual(results, []);
  release(draft);
  await running;
  assert.deepEqual(calls, ['first', 'second']);
  assert.deepEqual(results, [0, 1]);
});

test('cancellation before starting or from the start callback does not invoke generation', async () => {
  for (const initiallyAborted of [true, false]) {
    const controller = new AbortController(), starts: number[] = [];
    if (initiallyAborted) controller.abort();
    await generateCommitDrafts([entry('first'), entry('second')], async () => { assert.fail('cancelled generation must not run'); }, controller.signal, index => { starts.push(index); controller.abort(); }, () => assert.fail('cancelled generation must not publish a draft'));
    assert.deepEqual(starts, initiallyAborted ? [] : [0]);
  }
});

test('cancelling in flight discards its late result and never starts another worktree', async () => {
  const controller = new AbortController(), starts: number[] = [];
  let release!: (value: CommitDraft) => void;
  const running = generateCommitDrafts([entry('first'), entry('second')], () => new Promise(resolve => { release = resolve; }), controller.signal, index => starts.push(index), () => assert.fail('cancelled generation must not publish a draft'));
  controller.abort();
  release(draft);
  await running;
  assert.deepEqual(starts, [0]);
});

test('partial failure retains completed drafts and propagates the error without starting later entries', async () => {
  const failure = new Error('fixture generation failed'), calls: string[] = [], starts: number[] = [], results: [number, CommitDraft][] = [];
  await assert.rejects(generateCommitDrafts([entry('first'), entry('failed'), entry('later')], async input => {
    calls.push(input.repositoryId);
    if (input.repositoryId === 'failed') throw failure;
    return draft;
  }, new AbortController().signal, index => starts.push(index), (index, value) => results.push([index, value])), error => error === failure);
  assert.deepEqual(calls, ['first', 'failed']);
  assert.deepEqual(starts, [0, 1]);
  assert.deepEqual(results, [[0, draft]]);
});
