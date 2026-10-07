import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RepositoryFileTree } from '../src/RepositoryFileTree';
import type { RepositoryTask } from '../src/repository-model';
import { decoratedFileTree, type DecoratedFileTreeNode } from '../src/file-tree';
import { createGitRemoteFixture } from './git-remote-fixture';
import { RemoteRepositoryReader } from '../server/remote-repository-reader';

const task: RepositoryTask = { id: 'remote:main', branch: 'main', head: '1234567890abcdef', remote: true, path: null, treeComplete: true, files: [], tree: ['README.md', 'src/app.ts', 'src/later.ts', 'docs/new.md'], error: '' };
const changes = [{ path: 'docs/new.md', status: 'added' }, { path: 'src/app.ts', status: 'modified' }, { path: 'docs/removed.md', status: 'removed' }];

test('commit decoration retains the complete HEAD tree and shows added/modified/deleted paths without changing identity', () => {
  const html = renderToStaticMarkup(createElement(RepositoryFileTree, { task, changes, complete: true, selected: 'src/app.ts', onSelect: () => {} }));
  assert.match(html, /README\.md/); assert.match(html, /later\.ts/);
  assert.match(html, /12345678/);
  for (const kind of ['added', 'modified', 'deleted']) assert.match(html, new RegExp(`data-change="${kind}"`));
  assert.match(html, /removed\.md/); assert.match(html, /data-missing="true"/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /新增/); assert.match(html, /修改/); assert.match(html, /删除/);
  assert.doesNotMatch(html, /未改动.*<code>/);
});

test('View keeps the original tree and HEAD and passes only current-SHA changes as a separate decoration', () => {
  const view = readFileSync(new URL('../src/RepositoryView.tsx', import.meta.url), 'utf8');
  const tree = view.split('<div id="repository-file-trees"')[1];
  assert.match(tree, /task=\{task\}/);
  assert.match(tree, /changes=\{task.remote \? details\?\.files \|\| noChanges : undefined\}/);
  assert.doesNotMatch(tree, /tree: details\.tree|head: commitId|treeTask/);
  assert.match(tree, /remoteCommits\[task.id\]\?\.id === commitId/);
  assert.match(tree, /const commitId = selectedCommits\[task.id\];/);
  assert.match(tree, /const details = commitId &&/);
});

test('tree colors use light/dark semantic tokens and preserve neutral rows, selection and deletion meaning', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  for (const [kind, token] of [['added', 'teal'], ['modified', 'warning'], ['deleted', 'danger']]) {
    assert.match(css, new RegExp(`\\.repository-tree-row\\[data-change="${kind}"\\] \\{[^}]*color: var\\(--${token}\\);`));
  }
  assert.match(css, /data-change="deleted"\] \.repository-tree-name \{[^}]*text-decoration: line-through/);
  assert.match(css, /\.repository-tree-row\.selected \{[^}]*background: var\(--blue-bg\)/);
});

function flatten(nodes: DecoratedFileTreeNode[]): DecoratedFileTreeNode[] { return nodes.flatMap(node => [node, ...flatten(node.children)]); }

test('decoration does not mutate base paths or commit files and leaves unmodified names neutral', () => {
  const paths = ['z.ts', 'src/a.ts', 'README.md', 'src/a.ts'];
  const files = [{ path: 'src/a.ts', status: 'modified' }];
  const before = JSON.stringify({ paths, files });
  const nodes = flatten(decoratedFileTree(paths, files));
  assert.deepEqual(nodes.map(node => node.path), ['src', 'src/a.ts', 'README.md', 'z.ts']);
  assert.equal(nodes.find(node => node.path === 'README.md')?.change, undefined);
  assert.equal(nodes.find(node => node.path === 'src')?.change, 'modified');
  assert.equal(JSON.stringify({ paths, files }), before);
});

test('remote statuses and local XY statuses use the same three semantic colors', () => {
  for (const [status, kind] of [['added', 'added'], ['copied', 'added'], ['removed', 'deleted'], ['deleted', 'deleted'], ['modified', 'modified'], ['renamed', 'modified'], ['changed', 'modified'], ['??', 'added'], ['A', 'added'], ['AM', 'added'], [' M', 'modified'], ['MD', 'deleted'], ['R100', 'modified'], ['C100', 'added'], ['UU', 'modified']]) {
    assert.equal(decoratedFileTree(['file.ts'], [{ path: 'file.ts', status }])[0].change, kind, status);
  }
});

test('rename keeps old and new paths distinct while copies do not label the original as deleted', () => {
  const nodes = flatten(decoratedFileTree(['src/new.ts', 'copy.ts', 'original.ts'], [{ path: 'src/new.ts', previousPath: 'src/old.ts', status: 'renamed' }, { path: 'copy.ts', previousPath: 'original.ts', status: 'copied' }]));
  assert.equal(nodes.find(node => node.path === 'src/new.ts')?.change, 'modified');
  assert.equal(nodes.find(node => node.path === 'src/old.ts')?.change, 'deleted');
  assert.equal(nodes.find(node => node.path === 'src/old.ts')?.missing, true);
  assert.equal(nodes.find(node => node.path === 'original.ts')?.change, undefined);
  assert.equal(nodes.find(node => node.path === 'copy.ts')?.change, 'added');
});

test('directory aggregation propagates one kind or a mixed modified marker through nested folders', () => {
  const nodes = flatten(decoratedFileTree(['src/new/a.ts', 'docs/a.md'], [{ path: 'src/new/a.ts', status: 'added' }, { path: 'docs/a.md', status: 'added' }, { path: 'docs/old/b.md', status: 'removed' }]));
  assert.equal(nodes.find(node => node.path === 'src')?.change, 'added');
  assert.equal(nodes.find(node => node.path === 'src/new')?.change, 'added');
  assert.equal(nodes.find(node => node.path === 'docs')?.change, 'modified');
  assert.equal(nodes.find(node => node.path === 'docs/old')?.change, 'deleted');
});

test('changing or clearing the overlay drops historical ghosts without losing the global directory', () => {
  const first = decoratedFileTree(task.tree, changes);
  const cleared = flatten(decoratedFileTree(task.tree, []));
  assert.ok(flatten(first).some(node => node.path === 'docs/removed.md'));
  assert.ok(cleared.some(node => node.path === 'src/later.ts'));
  assert.ok(!cleared.some(node => node.path === 'docs/removed.md'));
  assert.ok(cleared.every(node => !node.change));
  const next = flatten(decoratedFileTree(task.tree, [{ path: 'README.md', status: 'modified' }]));
  assert.equal(next.find(node => node.path === 'README.md')?.change, 'modified');
  assert.equal(next.find(node => node.path === 'src/app.ts')?.change, undefined);
});

test('unknown or unchanged statuses do not invent a change or a file; empty base stays empty', () => {
  assert.equal(decoratedFileTree(['file.ts'], [{ path: 'file.ts', status: 'unchanged' }])[0].change, undefined);
  assert.deepEqual(decoratedFileTree([], [{ path: 'missing.ts', status: 'future-provider-status' }]), []);
});

test('incomplete or failed global tree remains labelled and does not borrow historical completeness', () => {
  const html = renderToStaticMarkup(createElement(RepositoryFileTree, { task: { ...task, treeComplete: false, error: '上次目录保留' }, changes, complete: false, onSelect: () => {} }));
  assert.match(html, /文件树不完整，显示已读取部分/);
  assert.match(html, /上次目录保留/); assert.match(html, /later\.ts/);
});

for (const provider of ['github', 'gitea'] as const) test(`${provider} real-Git commit changes annotate the later full HEAD tree, including a deleted ghost`, async t => {
  const fixture = await createGitRemoteFixture(provider, { treeChanges: true });
  t.after(() => fixture.cleanup());
  const reader = new RemoteRepositoryReader(provider, { fullName: 'qa/project', defaultBranch: 'main' }, fixture.transport);
  const workspace = await reader.workspace();
  const head = workspace.tasks.find(task => task.branch === 'main')!;
  const selected = workspace.commits.find(commit => commit.summary === 'Update project files')!;
  const details = await reader.commit(selected.id);
  assert.ok(head.tree.includes('src/later.ts')); assert.ok(!details.tree.includes('src/later.ts'));
  const nodes = flatten(decoratedFileTree(head.tree, details.files));
  assert.equal(nodes.find(node => node.path === 'src/later.ts')?.change, undefined);
  assert.equal(nodes.find(node => node.path === 'src/app.ts')?.change, 'modified');
  assert.equal(nodes.find(node => node.path === 'docs/status.md')?.change, 'added');
  assert.equal(nodes.find(node => node.path === 'docs/notes.md')?.change, 'deleted');
  assert.equal(nodes.find(node => node.path === 'docs/notes.md')?.missing, true);
  assert.ok(await fixture.unchanged());
});
