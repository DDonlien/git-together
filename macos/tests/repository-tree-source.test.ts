import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RepositoryView } from '../src/RepositoryView';
import { RepositoryFileTree } from '../src/RepositoryFileTree';
import type { RepositoryTask, RepositoryWorkspace } from '../src/repository-model';

const repository = { id: 'qa:1', remoteId: 1, accountId: 'qa', name: 'project', fullName: 'qa/project', description: '', defaultBranch: 'main', private: true, url: 'https://git.example.test/qa/project', available: true };
const account = { id: 'qa', provider: 'gitea' as const, host: 'https://git.example.test', name: 'QA', login: 'qa', updatedAt: '' };
const remote: RepositoryTask = { id: 'remote:main', branch: 'main', head: '1234567890abcdef', path: null, remote: true, treeComplete: true, files: [], tree: ['remote-only.md'], error: '' };
const local: RepositoryTask = { id: 'local:main', branch: 'main', head: 'abcdef1234567890', path: '/qa/main', files: [], tree: ['local-only.md'], error: '' };
const render = (workspace: RepositoryWorkspace) => renderToStaticMarkup(createElement(RepositoryView, { repository, account, workspace, localPath: '/qa/main', globalSearch: '', onConfigure: () => {} }));

test('file-tree source control is inside the right column heading with public pressed buttons', () => {
  const markup = render({ source: 'mixed', complete: true, tasks: [remote, local], commits: [] });
  const heading = markup.split('aria-label="文件树"')[1].split('</header>')[0];
  assert.match(heading, /<h2>文件树<\/h2>.*<legend class="ogui-sr-only">文件树来源<\/legend>/);
  assert.match(heading, /aria-controls="repository-file-trees"/);
  assert.match(heading, /aria-pressed="true"[^>]*>.*?<span>远端<\/span>/);
  assert.match(heading, /aria-pressed="false"[^>]*>.*?<span>本地<\/span>/);
});

test('mixed tree defaults to remote, hides local without unmounting, and does not hide either Diff card', () => {
  const markup = render({ source: 'mixed', complete: true, tasks: [remote, local], commits: [] });
  const tree = markup.split('id="repository-file-trees"')[1];
  assert.match(tree, /repository-task-slot"><section.*?remote-only\.md/);
  assert.match(tree, /repository-task-slot" hidden=""><section.*?local-only\.md/);
  const changes = markup.split('aria-label="Diff 与提交"')[1].split('aria-label="文件树"')[0];
  assert.doesNotMatch(changes, /hidden=""/);
  assert.match(changes, /aria-label="远端提交：main"/);
  assert.match(changes, /aria-label="更改任务：main"/);
});

test('local-only tree defaults to local; remote tree keeps SHA but drops duplicate source labels', () => {
  const markup = render({ source: 'local', complete: true, tasks: [local], commits: [] });
  const heading = markup.split('aria-label="文件树"')[1].split('</header>')[0];
  assert.match(heading, /aria-pressed="true"[^>]*>.*?<span>本地<\/span>/);
  assert.doesNotMatch(markup.split('id="repository-file-trees"')[1], /hidden=""/);
  const remoteTree = renderToStaticMarkup(createElement(RepositoryFileTree, { task: remote, onSelect: () => {}, complete: true }));
  assert.match(remoteTree, /12345678/);
  assert.doesNotMatch(remoteTree, /远端|<small>/);
});

test('source switch is view-only, keeps keyed trees, compact header, and explicit unlinked state', () => {
  const source = readFileSync(new URL('../src/RepositoryView.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(source, /key=\{task.id\}[^>]*hidden=\{!visibleTreeIds\.has\(task.id\)\}/);
  assert.match(source, /尚未关联本地目录。/);
  assert.doesNotMatch(source, /importAPI\(['"](?:checkout|switch|clone)|setFocusedTask\(.*treeSource/);
  assert.match(css, /\.repository-tree-source\.ogui-segments \{[^}]*margin-left: auto;[^}]*flex-shrink: 0;/);
  assert.match(css, /\.repository-tree-source\.ogui-segments \.ogui-segments__item \{[^}]*min-height: 22px;[^}]*font-size: 11px;/);
});

test('tree source track and item share the public thumb capsule radius without changing compact sizing', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  const track = css.match(/\.repository-tree-source\.ogui-segments \{([^}]*)\}/)?.[1];
  const item = css.match(/\.repository-tree-source\.ogui-segments \.ogui-segments__item \{([^}]*)\}/)?.[1];
  assert.ok(track);
  assert.ok(item);
  for (const rule of [track, item]) assert.match(rule, /border-radius: var\(--ogui-radius-capsule, 999px\);/);
  assert.match(track, /padding: 2px; gap: 2px;/);
  assert.match(item, /min-height: 22px; padding: 0 8px; font-size: 11px;/);
});
