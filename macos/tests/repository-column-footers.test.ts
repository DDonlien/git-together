import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RepositoryGraph } from '../src/RepositoryGraph';
import { RepositoryView } from '../src/RepositoryView';
import type { RepositoryWorkspace } from '../src/repository-model';

const workspace: RepositoryWorkspace = {
  source: 'local', complete: true,
  commits: [{ id: 'a'.repeat(40), parents: [], summary: 'Initial commit', author: 'QA', time: '2026-10-07T00:00:00Z', refs: ['main'] }],
  tasks: [{ id: 'main', branch: 'main', head: 'a'.repeat(40), path: '/qa/project', files: [], tree: ['README.md'], error: '' }],
};
const repository = { id: 'qa:1', remoteId: 1, accountId: 'qa', name: 'project', fullName: 'qa/project', description: '', defaultBranch: 'main', private: false, url: 'https://github.com/qa/project', available: true };
const account = { id: 'qa', provider: 'github' as const, host: 'https://github.com', name: 'QA', login: 'qa', updatedAt: '' };

test('graph has no persistent bottom status bar for empty, normal, matching or unmatched history', () => {
  for (const history of [workspace, { ...workspace, commits: [] }]) for (const search of ['', 'Initial', 'not-found']) {
    const markup = renderToStaticMarkup(createElement(RepositoryGraph, { workspace: history, search, focusedTask: null }));
    assert.doesNotMatch(markup, /repository-graph-status|graph-search-navigation|条提交|个匹配|>↑ ↓ 导航</);
    if (history.commits.length) assert.match(markup, /aria-label="提交历史"/);
  }
});

test('local and remote file-tree columns end at the content stack rather than bottom actions', () => {
  for (const source of ['local', 'remote'] as const) for (const localPath of [undefined, '/qa/project']) {
    const supplied = { ...workspace, source, tasks: workspace.tasks.map(task => ({ ...task, remote: source === 'remote', path: source === 'remote' ? null : task.path, treeComplete: true })) };
    const markup = renderToStaticMarkup(createElement(RepositoryView, { repository, account, workspace: supplied, localPath, globalSearch: '', onConfigure: () => {} }));
    assert.doesNotMatch(markup, /repository-graph-status|repository-tree-actions|配置本地目录/);
    assert.match(markup, /<legend class="ogui-sr-only">文件树来源<\/legend>/);
    assert.match(markup, /aria-label="收起文件树"/);
    assert.match(markup, /aria-label="在 GitHub 打开 README.md"|aria-label="用默认应用打开 README.md"/);
    assert.match(markup, /<div id="repository-file-trees" class="repository-task-stack is-focused">[\s\S]*<\/div><\/section><\/div><\/div><\/main>$/);
  }
});

test('navigation, search shortcuts and actionable copy feedback survive footer and options removal', () => {
  const source = readFileSync(new URL('../src/RepositoryGraph.tsx', import.meta.url), 'utf8');
  assert.match(source, /onKeyDown=\{event => keyboard\(event, index\)\}/);
  assert.match(source, /window.addEventListener\('keydown', navigate\)/);
  assert.match(source, /nextGraphMatch\(matches, byId.get\(selected \|\| ''\) \?\? -1, event.shiftKey \? -1 : 1\)/);
  assert.match(source, /event.key === 'F3'/);
  assert.match(source, /feedback && <p className="repository-data-note" role="status">\{feedback\}<\/p>/);
});

test('removed footer CSS cannot reserve height or a divider; content scrolling stays unchanged', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /\.repository-graph-status|\.graph-search-navigation|\.repository-tree-actions/);
  assert.match(css, /\.repository-graph-scroll \{[^}]*flex: 1;[^}]*min-height: 0;[^}]*overflow: auto;/);
  assert.match(css, /\.repository-task-tree \{[^}]*flex: 1;[^}]*min-height: 0;[^}]*overflow: auto;/);
});
