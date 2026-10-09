import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RepositoryView } from '../src/RepositoryView';
import { RepositoryGraph } from '../src/RepositoryGraph';
import { buildFileTree, snapshotWorkspace, taskCommitHistory, type RepositoryCommit, type RepositoryWorkspace } from '../src/repository-model';
import { layoutCommitGraph } from '../src/commit-graph';
import { readRepositoryWorkspace, readRepositoryTaskDiff, parseWorktrees } from '../server/repository-reader';
import { createRepositoryFixture } from './repository-fixture';
import type { Account, RemoteRepository } from '../src/import-model';

const repository: RemoteRepository = { id: 'qa:1', remoteId: 1, accountId: 'qa', name: 'project', fullName: 'qa/project', description: '', defaultBranch: 'main', private: true, url: 'https://git.example.test/qa/project', available: true };
const account: Account = { id: 'qa', provider: 'gitea', host: 'https://git.example.test', name: 'QA', login: 'qa', updatedAt: '' };
const commit = (id: string, parents: string[]): RepositoryCommit => ({ id, parents, summary: id, author: 'QA', time: '2026-10-06T01:00:00Z', refs: [] });

test('commit graph starts with records without a header row and retains dynamic lanes, byline and selection controls', () => {
  for (const commits of [[commit('single', [])], [commit('merge', ['left', 'right']), commit('left', ['base']), commit('right', ['base']), commit('base', [])]]) {
    const workspace: RepositoryWorkspace = { complete: true, tasks: [], commits: commits.map((item, index) => ({ ...item, refs: index ? [] : ['origin/main'] })) };
    const markup = renderToStaticMarkup(createElement(RepositoryGraph, { workspace, search: '', focusedTask: null }));
    const lanes = Math.max(1, ...layoutCommitGraph(commits).map(row => row.width));
    assert.doesNotMatch(markup, /<thead|<th[ >]|作者 \/ 日期|>说明<|>图</);
    assert.match(markup, /<table class="repository-graph-table" aria-label="提交历史"><colgroup>/);
    assert.match(markup, new RegExp(`<col style="width:${lanes * 14 + 20}px"/>`));
    assert.match(markup, /<col style="width:66px"\/><\/colgroup><tbody>/);
    assert.equal((markup.match(/<tr[ >]/g) || []).length, commits.length);
    assert.equal((markup.match(/class="graph-node /g) || []).length, commits.length);
    assert.equal((markup.match(/aria-pressed="false"/g) || []).length, commits.length);
    assert.match(markup, /class="commit-ref graph-color-0 graph-remote-ref"[^>]*title="origin\/main"/);
    assert.match(markup, /class="repository-graph-byline" title="QA"><span>QA<\/span><time dateTime="2026-10-06T01:00:00Z"/);
    for (const item of commits) { assert.ok(markup.includes(`<strong>${item.summary}</strong>`)); assert.ok(markup.includes(`<code>${item.id.slice(0, 8)}</code>`)); }
  }
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /\.repository-graph-table th/);
});

test('three persistent columns follow graph, changes/composer, tree after a spanning metadata group', () => {
  const markup = renderToStaticMarkup(createElement(RepositoryView, { repository, account, globalSearch: '', onConfigure: () => {} }));
  assert.equal((markup.match(/<h1>/g) || []).length, 1);
  const positions = ['aria-label="仓库信息"', 'aria-label="分支图"', 'aria-label="Diff 与提交"', 'aria-label="文件树"'].map(value => markup.indexOf(value));
  assert.ok(positions.every((position, index) => position >= 0 && (!index || position > positions[index - 1])));
  assert.match(markup, /选择一个提交查看差异/);
  assert.doesNotMatch(markup, /repository-commit-composer|<textarea|>Commit</);
  assert.doesNotMatch(markup, /readonly-tabs|topbar/);
  assert.match(markup, /<legend class="ogui-sr-only">文件树来源<\/legend>/);
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /<header className="topbar/);
});

test('overview shows the provider remote URL and access account without association, path or identity subline', () => {
  for (const provider of ['gitea', 'github'] as const) {
    const url = provider === 'gitea' ? 'https://git.example.test:10443/owner/project' : 'https://github.com/owner/project';
    const markup = renderToStaticMarkup(createElement(RepositoryView, { repository: { ...repository, url }, account: { ...account, provider }, localPath: '/qa/main', globalSearch: '', onConfigure: () => {} }));
    const overview = markup.split('aria-label="仓库信息"')[1].split('</section>')[0];
    assert.ok(overview.includes(`<p title="${url}">${url}</p>`));
    assert.match(overview, /<dt>访问账号<\/dt><dd[^>]*>QA<\/dd>/);
    assert.match(overview, /<dt>默认分支<\/dt>/);
    assert.equal((overview.match(/<dt>/g) || []).length, 2);
    assert.doesNotMatch(overview, /<small>|<button|<dt>账号<\/dt>|本地目录|尚未关联|\/qa\/main/);
  }
});

test('linked local file trees omit the removed bottom actions even when remote access has been lost', () => {
  const workspace: RepositoryWorkspace = { source: 'local', complete: true, tasks: [{ id: 'main', branch: 'main', head: 'a', path: '/qa/main', files: [], tree: ['README.md'], error: '' }], commits: [] };
  const markup = renderToStaticMarkup(createElement(RepositoryView, { repository: { ...repository, available: false }, account, localPath: '/qa/main', workspace, globalSearch: '', onConfigure: () => {} }));
  const tree = markup.split('aria-label="文件树"')[1];
  assert.match(tree, /aria-label="文件树：main"/);
  assert.doesNotMatch(tree, /repository-tree-actions|配置本地目录/);
  assert.doesNotMatch(markup.split('aria-label="仓库信息"')[1].split('</section>')[0], /<button/);
});

test('unlinked association reuses the configuration callback only in the local tree empty state with access guard', () => {
  const source = readFileSync(new URL('../src/RepositoryView.tsx', import.meta.url), 'utf8');
  assert.match(source, /treeSource === 'local' && !localPath && <Button onClick=\{onConfigure\} disabled=\{!repository.available\}>关联本地目录<\/Button>/);
  const markup = renderToStaticMarkup(createElement(RepositoryView, { repository, account, globalSearch: '', onConfigure: () => {} }));
  assert.doesNotMatch(markup, /关联本地目录<\/span>|配置本地目录<\/span>/);
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /onConfigure=\{\(\) => setConfiguring\(\{ repository \}\)\}/);
  assert.match(app, /configuring && <LocalRepositoryModal/);
});

test('overview layout has two shrinking metadata columns and no stale path or identity-subline rules', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.repository-overview dl \{[^}]*grid-template-columns: repeat\(2,minmax\(0,1fr\)\);/);
  assert.doesNotMatch(css, /\.repository-overview-path|\.repository-overview dd small/);
});

test('all worktree cards stay mounted with independent drafts while only one change context is visible', () => {
  const workspace: RepositoryWorkspace = { complete: true, commits: [], tasks: [
    { id: 'a', branch: 'main', head: 'a', path: '/qa/main', files: [], tree: ['src/app.ts'], error: '' },
    { id: 'b', branch: 'task/search', head: 'b', path: '/qa/search', files: [], tree: ['docs/search.md'], error: '' },
    { id: 'c', branch: 'task/review', head: 'c', path: null, files: [], tree: ['README.md'], error: '' },
  ] };
  const markup = renderToStaticMarkup(createElement(RepositoryView, { repository, account, localPath: '/qa/main', workspace, globalSearch: '', onConfigure: () => {} }));
  for (const branch of ['main', 'task/search', 'task/review']) {
    assert.match(markup, new RegExp(`aria-label="更改任务：${branch}"`));
    assert.match(markup, new RegExp(`aria-label="文件树：${branch}"`));
    assert.match(markup, new RegExp(`>提交说明：${branch}<`));
  }
  assert.equal((markup.match(/<textarea/g) || []).length, 3);
  assert.equal((markup.match(/repository-task-slot" hidden=""/g) || []).length, 2);
  assert.match(markup, /未检出 · 分支快照/);
  assert.doesNotMatch(markup, /完整目录等待服务更新/);
  const source = readFileSync(new URL('../src/RepositoryView.tsx', import.meta.url), 'utf8');
  assert.match(source, /key=\{task.id\}[^>]*hidden=/);
  assert.doesNotMatch(source, /importAPI\(['"](?:checkout|switch)/);
});

test('focused and single task panes constrain Diff content so the composer stays reachable at the bottom', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.repository-task-slot:only-child, \.repository-task-stack\.is-focused > \.repository-task-slot \{ flex: 1 1 0; \}/);
  assert.match(css, /\.repository-change-task \{[^}]*min-height: 0;/);
  assert.match(css, /\.repository-task-body \{[^}]*min-height: 0;[^}]*overflow: hidden;/);
  assert.match(css, /\.repository-changed-files \{[^}]*min-height: 0;[^}]*overflow: auto;/);
  assert.match(css, /\.repository-change-context > \.repository-task-slot \{ flex: 1 1 0; overflow: hidden; \}/);
  assert.match(css, /\.repository-commit-composer \{[^}]*flex-shrink: 0;/);
  assert.match(css, /\.repository-task-tree \{[^}]*min-height: 0;[^}]*overflow: auto;/);
});

test('older snapshot contains only the known task and changed paths, without invented ancestry', () => {
  const workspace = snapshotWorkspace({ path: '/qa/main', branch: 'main', files: [{ path: 'src/app.ts', status: 'M', tracked: true }], commits: [commit('a', ['b']), commit('b', [])] });
  assert.equal(workspace.complete, false); assert.equal(workspace.tasks.length, 1);
  assert.deepEqual(workspace.tasks[0].tree, ['src/app.ts']);
  assert.ok(workspace.commits.every(commit => commit.parents.length === 0));
  assert.ok(layoutCommitGraph(workspace.commits).every(row => row.edges.length === 0));
});

test('real parent IDs create fork and merge lanes; unrelated adjacent commits stay disconnected', () => {
  const rows = layoutCommitGraph([commit('merge', ['left', 'right']), commit('left', ['base']), commit('right', ['base']), commit('base', []), commit('unrelated', [])]);
  assert.equal(rows[0].edges.filter(edge => edge.node).length, 2);
  assert.notEqual(rows[1].lane, rows[2].lane);
  assert.ok(rows.every(row => row.edges.every(edge => edge.from >= 0 && edge.to >= 0)));
  assert.equal(rows[4].edges.length, 0);
  assert.equal(rows[3].commit.id, 'base');
});

test('file tree deduplicates paths and sorts folders first with correct hierarchy', () => {
  const tree = buildFileTree(['z.ts', 'src/nested/b.ts', 'src/a.ts', 'README.md', 'src/a.ts']);
  assert.deepEqual(tree.map(node => node.name), ['src', 'README.md', 'z.ts']);
  assert.deepEqual(tree[0].children.map(node => node.name), ['nested', 'a.ts']);
  assert.equal(tree[0].children[0].children[0].path, 'src/nested/b.ts');
  assert.equal(tree[0].children[1].directory, false);
});

test('focus shows only a task head and its actual ancestors, while default retains every branch', () => {
  const commits = [commit('merge', ['left', 'right']), commit('left', ['base']), commit('right', ['base']), commit('base', [])];
  const workspace: RepositoryWorkspace = { complete: true, commits, tasks: [{ id: 'left-task', branch: 'task/left', head: 'left', path: '/qa/left', files: [], tree: [], error: '' }] };
  assert.deepEqual(taskCommitHistory(workspace, 'left-task').map(commit => commit.id), ['left', 'base']);
  assert.equal(taskCommitHistory(workspace, null), commits);
  assert.equal(taskCommitHistory({ ...workspace, complete: false }, 'left-task'), commits);
});

test('porcelain worktrees preserve paths containing spaces and newlines plus detached/bare states', () => {
  const trees = parseWorktrees('worktree /qa/main\0HEAD abc\0branch refs/heads/main\0\0worktree /qa/task with\nnewline\0HEAD def\0detached\0\0worktree /qa/bare\0bare\0\0');
  assert.equal(trees[1].path, '/qa/task with\nnewline'); assert.equal(trees[1].branch, 'Detached HEAD'); assert.equal(trees[2].bare, true);
});

test('real Git enumerates simultaneous tasks, complete tracked/untracked trees, merge parents and isolated Diff without writes', async () => {
  const fixture = await createRepositoryFixture();
  try {
    const workspace = await readRepositoryWorkspace(fixture.directory);
    assert.equal(workspace.complete, true); assert.equal(workspace.tasks.length, 3);
    const main = workspace.tasks.find(task => task.branch === 'main')!;
    const feature = workspace.tasks.find(task => task.branch === 'task/search')!;
    const review = workspace.tasks.find(task => task.branch === 'task/review')!;
    assert.equal(main.path, fixture.directory); assert.equal(feature.path, fixture.feature); assert.equal(review.path, null);
    assert.ok(main.tree.includes('docs/notes.md')); assert.ok(main.tree.includes('src/new.ts')); assert.ok(!main.tree.includes('ignored.txt'));
    assert.ok(review.tree.includes('src/app.ts')); assert.ok(!review.tree.includes('src/search.ts'));
    assert.equal(workspace.commits.find(commit => commit.summary === 'Merge search task')?.parents.length, 2);
    assert.ok(workspace.commits.some(commit => commit.refs.includes('task/review')));
    const mainDiff = await readRepositoryTaskDiff(fixture.directory, main.id, 'src/app.ts');
    const featureDiff = await readRepositoryTaskDiff(fixture.directory, feature.id, 'src/app.ts');
    assert.match(mainDiff, /value = 10/); assert.doesNotMatch(mainDiff, /value = 20/);
    assert.match(featureDiff, /value = 20/); assert.doesNotMatch(featureDiff, /value = 10/);
    assert.match(await readRepositoryTaskDiff(fixture.directory, main.id, 'src/:(top)all.ts'), /literal = 1/);
    assert.match(await readRepositoryTaskDiff(fixture.directory, main.id, 'src/new.ts'), /不会读取或上传/);
    await assert.rejects(readRepositoryTaskDiff(fixture.directory, main.id, '../outside'), /更改列表/);
    await assert.rejects(readRepositoryTaskDiff(fixture.directory, review.id, 'src/app.ts'), /工作目录/);
    assert.equal(await fixture.unchanged(), true);
  } finally { await fixture.cleanup(); }
});

test('missing worktrees fail individually while healthy tasks and their history remain readable', async () => {
  const fixture = await createRepositoryFixture();
  try {
    const missingPath = `${fixture.root}/missing`;
    await fixture.git(fixture.directory, ['worktree', 'add', '-b', 'task/missing', missingPath]);
    const { rm } = await import('node:fs/promises'); await rm(missingPath, { recursive: true });
    const workspace = await readRepositoryWorkspace(fixture.directory);
    assert.ok(workspace.tasks.find(task => task.branch === 'task/missing')?.error);
    assert.equal(workspace.tasks.find(task => task.branch === 'main')?.error, '');
    assert.ok(workspace.commits.length > 0);
    assert.equal(await fixture.unchanged(), true);
  } finally { await fixture.cleanup(); }
});

test('an unborn repository has one real task, untracked files and no invented commit', async () => {
  const fixture = await createRepositoryFixture();
  try {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const path = `${fixture.root}/unborn`;
    await mkdir(path); await fixture.git(path, ['init', '-b', 'new-task']);
    await writeFile(`${path}/README.md`, '# New task\n');
    const workspace = await readRepositoryWorkspace(path);
    assert.equal(workspace.tasks.length, 1); assert.equal(workspace.tasks[0].branch, 'new-task');
    assert.deepEqual(workspace.tasks[0].tree, ['README.md']); assert.equal(workspace.commits.length, 0);
  } finally { await fixture.cleanup(); }
});
