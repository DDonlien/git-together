import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspace, scenes, demoDiff } from '../src/data';
import { applyOperation, commitWorktree, generateDraft, operationProblem, readWorkspace, resolveSelection, toggleRepository, updateWorktree, worktreesOf } from '../src/domain';

test('13 reference states, 8 repositories, 11 distinct worktrees, 3 agents, 1 alert', () => {
  const seed = createWorkspace(), trees = worktreesOf(seed.repositories);
  assert.equal(scenes.length, 13); assert.equal(seed.repositories.length, 8); assert.equal(trees.length, 11);
  assert.equal(new Set(trees.map(w => w.id)).size, 11);
  assert.equal(trees.reduce((n, w) => n + w.agents, 0), 3); assert.equal(trees.filter(w => w.presence).length, 1);
});
test('repository selection is all worktrees and deduplicated, never an uncheckout branch', () => {
  const { repositories } = createWorkspace(), repository = repositories[0];
  const ids = toggleRepository(['ball-controller', 'lebab-main'], repository);
  assert.equal(new Set(ids).size, ids.length); assert.equal(resolveSelection(repositories, ids).length, 4);
  assert.deepEqual(toggleRepository(ids, repository), ['lebab-main']);
  assert.equal(resolveSelection(repositories, ['console/main', 'unknown']).length, 0);
});
test('local commit only includes selected files, keeps others, adds a parent, clears the form', () => {
  const worktree = createWorkspace().repositories[0].worktrees[1];
  worktree.draft = { summary: '  Improve input  ', description: 'Tested with controller' };
  const next = commitWorktree(worktree, 'abcdef1', '刚刚');
  assert.equal(next.commits[0].summary, 'Improve input'); assert.equal(next.commits[0].files.length, 3);
  assert.deepEqual(next.commits[0].parents, [worktree.commits[0].id]); assert.equal(next.files.length, 5);
  assert.equal(next.ahead, worktree.ahead + 1); assert.deepEqual(next.draft, { summary: '', description: '' });
  assert.equal(worktree.files.length, 8); assert.equal(worktree.draft.summary, '  Improve input  ');
});
test('validation failure cannot mutate input or file selection', () => {
  const worktree = createWorkspace().repositories[0].worktrees[1], before = structuredClone(worktree);
  assert.throws(() => commitWorktree(worktree, 'bad', 'now'), /概要/); assert.deepEqual(worktree, before);
  assert.throws(() => commitWorktree({ ...worktree, draft: { summary: 'Valid', description: '' }, files: worktree.files.map(f => ({ ...f, selected: false })) }, 'bad', 'now'), /选择/);
  assert.throws(() => commitWorktree({ ...worktree, conflict: true }, 'bad', 'now'), /冲突/);
});
test('updates and drafts are isolated by worktree id', () => {
  const { repositories } = createWorkspace();
  const next = updateWorktree(repositories, 'ball-controller', w => ({ ...w, draft: { summary: 'Independent', description: '' } }));
  assert.equal(next[0].worktrees[1].draft.summary, 'Independent'); assert.equal(next[0].worktrees[0].draft.summary, '');
  assert.equal(next[1].worktrees[0], repositories[1].worktrees[0]);
});
test('AI uses selected files only and rejects an empty selection', () => {
  const w = createWorkspace().repositories[0].worktrees[1], draft = generateDraft(w);
  assert.match(draft.description, /ControllerInput/); assert.doesNotMatch(draft.description, /GamepadIcon/);
  assert.throws(() => generateDraft({ ...w, files: [] }), /选择/);
});
test('Fetch is safe with changes; Pull and Get Latest require clean fast-forward', () => {
  const w = createWorkspace().repositories[0].worktrees[1];
  assert.equal(operationProblem(w, 'Fetch', true), null);
  assert.match(operationProblem(w, 'Pull', true)!, /未提交/);
  assert.match(operationProblem({ ...w, files: [], ahead: 1, behind: 1 }, 'Get Latest', true)!, /分叉/);
  assert.match(operationProblem({ ...w, conflict: true }, 'Submit', true)!, /冲突/);
  assert.equal(applyOperation({ ...w, files: [], behind: 3 }, 'Get Latest', 'a', 'now').behind, 0);
});
test('Submit has separate local-commit/push semantics and retains unselected changes', () => {
  const w = createWorkspace().repositories[0].worktrees[1], next = applyOperation(w, 'Submit', 'abc', 'now');
  assert.equal(next.commits.length, w.commits.length + 1); assert.equal(next.ahead, 0); assert.equal(next.files.length, 5);
  assert.throws(() => applyOperation({ ...w, files: w.files.map(f => ({ ...f, selected: false })) }, 'Submit', 'abc', 'now'), /选择文件/);
  assert.match(operationProblem({ ...w, id: 'lebab-main' }, 'Submit', true)!, /未推送/);
  assert.equal(operationProblem({ ...w, id: 'lebab-main' }, 'Submit', false), null);
});
test('commit graph is newest-first with parents below and no cycles in the fixture', () => {
  const commits = createWorkspace().repositories[0].worktrees[1].commits;
  for (const [i, c] of commits.entries()) for (const parent of c.parents) assert.ok(commits.findIndex(p => p.id === parent) > i);
});
test('binary and image assets have no fabricated text Diff', () => {
  const files = createWorkspace().repositories[0].worktrees[1].files;
  for (const f of files.filter(f => f.kind !== 'text')) assert.deepEqual(demoDiff(f), []);
  assert.ok(demoDiff(files[0]).some(l => l.type === 'add'));
});
test('storage roundtrip, missing store, incompatible schema and invalid JSON', () => {
  const seed = createWorkspace(); assert.deepEqual(readWorkspace(JSON.stringify(seed), createWorkspace), seed);
  assert.equal(readWorkspace(null, createWorkspace).repositories.length, 8);
  assert.throws(() => readWorkspace('{"version":2}', createWorkspace), /格式无效/);
  assert.throws(() => readWorkspace('broken', createWorkspace));
  assert.throws(() => readWorkspace(JSON.stringify({ ...seed, repositories: [{ id: 'invalid' }] }), createWorkspace), /格式无效/);
});
