import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RepositoryBranchRows } from '../src/Dashboard';
import type { RemoteRepository } from '../src/import-model';
import { isRemoteWorkspace, type RemoteRepositoryState, type RemoteRepositoryWorkspace } from '../src/remote-repository-model';
import { createRemoteServiceFixture } from './remote-service-fixture';

const repository: RemoteRepository = { id: 'a:1', accountId: 'a', remoteId: 1, name: 'project', fullName: 'org/project', description: '', defaultBranch: 'main', private: true, available: true, url: 'https://github.com/org/project' };
const workspace: RemoteRepositoryWorkspace = { source: 'remote', checkedAt: 123, complete: true, warnings: [], commits: [], tasks: ['main', 'feature/search', 'release/2.0'].map(branch => ({ id: `remote:${branch}`, branch, head: 'a'.repeat(40), remote: true, path: null, files: [], tree: [], treeComplete: true, error: '' })) };
const render = (state: RemoteRepositoryState, repo = repository, blocked = false) => renderToStaticMarkup(createElement(RepositoryBranchRows, { repository: repo, state, blocked }));
const ready = (value = workspace): RemoteRepositoryState => ({ workspace: value, loading: false, error: '' });

test('expanded repositories render exactly one table row per returned branch, with a default attribute only on that row', () => {
  const markup = render(ready());
  const rows = [...markup.matchAll(/<tr class="dashboard-branch-row">([\s\S]*?)<\/tr>/g)].map(match => match[1]);
  assert.equal(rows.length, 3);
  for (const [index, row] of rows.entries()) { assert.match(row, /<td colSpan="6">/); assert.ok(row.includes(workspace.tasks[index].branch)); }
  assert.equal((markup.match(/class="dashboard-default-branch"/g) || []).length, 1);
  assert.match(rows[0], />默认<\/small>/); assert.doesNotMatch(rows[1], /默认/);
  assert.doesNotMatch(markup, /<button|checkout|本地目录/);
});

test('missing default branch is not injected and a truly empty remote has no fabricated main row', () => {
  assert.doesNotMatch(render(ready(), { ...repository, defaultBranch: 'missing' }), /dashboard-default-branch|>missing</);
  const markup = render(ready({ ...workspace, tasks: [] }));
  assert.match(markup, /此仓库暂无远端分支/); assert.doesNotMatch(markup, /dashboard-branch-row|>main</);
});

test('initial loading and a blocked service are status messages, not empty branches or default-name rows', () => {
  const state = { workspace: null, loading: true, error: '' };
  assert.match(render(state), /role="status"[\s\S]*正在读取远端分支/);
  assert.match(render(state, repository, true), /账号服务尚未就绪/);
  for (const markup of [render(state), render(state, repository, true)]) assert.doesNotMatch(markup, /暂无远端分支|dashboard-branch-row|>main</);
});

test('a first read error stays distinct from an empty repository and offers a disclosure retry', () => {
  const markup = render({ workspace: null, loading: false, error: '访问账号目前无权读取此仓库。' });
  assert.match(markup, /role="alert"/); assert.match(markup, /无权读取/); assert.match(markup, /收起后重新展开可重试/);
  assert.doesNotMatch(markup, /暂无远端分支|dashboard-branch-row|已保留/);
});

test('a background failure labels retained branches and history/tree failures do not hide known branch names', () => {
  const markup = render({ ...ready({ ...workspace, complete: false, tasks: workspace.tasks.map(task => ({ ...task, error: 'History unavailable' })) }), error: '网络不可用' });
  assert.equal((markup.match(/class="dashboard-branch-row"/g) || []).length, 3);
  assert.match(markup, /网络不可用/); assert.match(markup, /已保留上次读取的分支/);
});

test('lost catalog access pauses reading and explicitly labels any already-read branches as retained', () => {
  const markup = render(ready(), { ...repository, available: false });
  assert.match(markup, /无权读取此仓库/); assert.match(markup, /已保留上次读取的分支/);
  assert.equal((markup.match(/class="dashboard-branch-row"/g) || []).length, 3);
});

test('branch pagination limits are visible but unrelated history/tree warnings are not branch-list errors', () => {
  const markup = render(ready({ ...workspace, complete: false, warnings: ['分支超过单次读取上限（1000 个）；当前仅显示已读取的分支。', '每个分支当前读取最近 50 条提交；图线只使用真实父节点，不代表全部历史。', 'main 的文件树达到接口/读取上限，当前只显示已读取部分。'] }));
  assert.match(markup, /1000 个/); assert.match(markup, /仅显示已读取的分支/);
  assert.doesNotMatch(markup, /50 条提交|文件树达到/);
});

test('branch names are literal escaped text, including long paths and provider-supplied markup', () => {
  const branch = '<script>bad</script>/feature/"quoted"';
  const markup = render(ready({ ...workspace, tasks: [{ ...workspace.tasks[0], branch }] }));
  assert.match(markup, /&lt;script&gt;bad&lt;\/script&gt;\/feature\/&quot;quoted&quot;/);
  assert.doesNotMatch(markup, /<script>|dangerouslySetInnerHTML/);
});

test('disclosure reuses the finite remote reader, instance-bound identity and independent multi-expansion without changing counts or navigation', () => {
  const source = readFileSync(new URL('../src/Dashboard.tsx', import.meta.url), 'utf8');
  assert.match(source, /useState<Set<string>>\(new Set\(\)\)/);
  assert.match(source, /JSON.stringify\(\[controller.catalog.instanceId, repo.id\]\)/);
  assert.match(source, /useRemoteRepository\(repo, controller.catalog.instanceId, expanded && ready\)/);
  assert.match(source, /aria-expanded=\{expanded\} aria-controls=\{branchesId\}/);
  assert.match(source, /hidden=\{!expanded\}/); assert.match(source, /filtered.length\} 个仓库/);
  assert.match(source, /onClick=\{\(\) => onOpen\(repo.id\)\}/);
  assert.doesNotMatch(source, /<th[^>]*>默认分支|fetch\(|remoteFile|remoteCommit/);
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.remote-repo-table th:nth-child\(5\) \{ width: 96px/);
  assert.match(css, /\.remote-repo-table th:nth-child\(6\) \{ width: 40px/);
  assert.doesNotMatch(css, /\.remote-repo-table th:nth-child\(7\)/);
});

test('the existing folder tile is the only disclosure, without an extra arrow or a changed hit-area size', () => {
  const source = readFileSync(new URL('../src/Dashboard.tsx', import.meta.url), 'utf8');
  assert.match(source, /<IconButton className="repository-icon-tile repository-disclosure" icon="folder"/);
  assert.doesNotMatch(source, /icon=\{expanded \? 'down' : 'right'\}|<span className="repository-icon-tile"/);
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  const disclosure = css.match(/\.remote-name \.repository-icon-tile\.repository-disclosure \{([^}]+)\}/)?.[1] || '';
  assert.match(disclosure, /width: var\(--repository-icon-size\); height: var\(--repository-icon-size\)/);
  assert.doesNotMatch(disclosure, /(?:width|height): (?:24|28)px/);
  assert.match(css, /\.remote-name \.repository-disclosure svg \{ width: 19px; height: 19px;/);
});

for (const provider of ['github', 'gitea'] as const) test(`${provider}: Dashboard branch rows come from the actual AccountService reader over isolated real Git`, async t => {
  const fixture = await createRemoteServiceFixture(provider); t.after(fixture.cleanup);
  const result = await fixture.service.handle('remoteWorkspace', { repositoryId: fixture.repositoryId });
  assert.ok(isRemoteWorkspace(result));
  const expected = (await fixture.git(fixture.directory, ['for-each-ref', '--format=%(refname:short)', 'refs/heads'])).stdout.trim().split('\n').sort();
  const markup = render(ready(result));
  assert.equal((markup.match(/class="dashboard-branch-row"/g) || []).length, expected.length);
  assert.deepEqual(result.tasks.map(task => task.branch).sort(), expected);
  for (const name of expected) assert.ok(markup.includes(`title="${name}"`));
  assert.equal(await fixture.unchanged(), true);
});
