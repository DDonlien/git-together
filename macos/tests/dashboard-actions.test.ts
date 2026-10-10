import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RepositoryActions } from '../src/RepositoryActions';
import { gitSignals } from '../src/branch-links';

const signals = gitSignals([], { workspace: null, loading: false, error: '' });
const items = () => renderToStaticMarkup(createElement(RepositoryActions, { label: 'Git 操作：org/shared · Personal', signals }));

function buttons(markup: string) {
  return [...markup.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)].map(match => ({ attributes: match[1], text: match[2].replace(/<[^>]+>/g, '') }));
}

test('repository Git icons are flat, labelled and do not open an ellipsis menu', () => {
  const markup = items();
  assert.equal((markup.match(/role="group"/g) || []).length, 5);
  assert.doesNotMatch(markup, /aria-haspopup|role="menu|role="separator"/);
  const actions = buttons(markup);
  assert.deepEqual(actions.map(action => action.attributes.match(/aria-label="([^"]+)"/)?.[1]), ['Pull', 'Get Latest', 'Commit', 'Submit', 'Push', 'Clean']);
  assert.doesNotMatch(markup, /aria-label="Ignore/);
});

test('unavailable scopes are disabled, explained and never represent success', () => {
  const markup = items();
  for (const action of buttons(markup)) assert.match(action.attributes, /disabled=""/);
  assert.doesNotMatch(markup, /已提交|已推送|操作成功/);
  assert.match(markup, /当前范围没有可操作的工作目录/);
  assert.match(markup, /aria-label="Get Latest[^"]*下载当前分支最新快照[^"]*清理旧历史与缓存/);
  assert.match(markup, /aria-label="Clean[^"]*以远端为准清理或恢复本地文件/);
  assert.doesNotMatch(markup, /Reconcile|data-action-name="Fetch"|data-action-name="Clear"/);
});

test('available Commit opens the composer only when its range has changes', () => {
  const markup = renderToStaticMarkup(createElement(RepositoryActions, { label: 'Git 操作', signals: { ...signals, commit: { ...signals.commit, count: 3 } }, onCommit() {} }));
  const actions = buttons(markup);
  assert.match(actions[2].attributes, /aria-label="Commit：[^"]*确认提交说明和文件清单/);
  assert.doesNotMatch(actions[2].attributes, /disabled=""|aria-hidden="true"/);
  for (const [index, action] of actions.entries()) if (index !== 2) assert.match(action.attributes, /disabled=""/);
  const empty = renderToStaticMarkup(createElement(RepositoryActions, { label: 'Git 操作', signals, onCommit() {} }));
  assert.match(buttons(empty)[2].attributes, /disabled=""/);
  assert.doesNotMatch(markup, /已提交|已推送|操作成功/);
});

test('Pull, Get Latest and Clean open a preview even when their comparison counts are unknown', () => {
  const markup = renderToStaticMarkup(createElement(RepositoryActions, { label: 'Git 操作', signals, onPull() {}, onLatest() {}, onClean() {} }));
  const actions = buttons(markup);
  for (const index of [0, 1, 5]) assert.doesNotMatch(actions[index].attributes, /disabled=""/);
  for (const index of [2, 3, 4]) assert.match(actions[index].attributes, /disabled=""/);
  const busy = buttons(renderToStaticMarkup(createElement(RepositoryActions, { label: 'Git 操作', signals, busy: true, onPull() {}, onLatest() {}, onClean() {} })));
  for (const action of busy) assert.match(action.attributes, /disabled=""/);
});

test('each unavailable scope retains accessible detail without long native-title prompts', () => {
  const markup = items();
  assert.match(markup, /aria-label="Git 操作：org\/shared · Personal"/);
  assert.equal((markup.match(/tabindex="0"/g) || []).length, 6);
  assert.equal((markup.match(/aria-disabled="true"/g) || []).length, 6);
  for (const action of buttons(markup)) assert.match(action.attributes, /title=""/);
  const source = readFileSync(new URL('../src/RepositoryActions.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /createPortal|role="tooltip"|onMouseMove|aria-describedby/);
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.git-action-anchor:hover \{[^}]*background: var\(--surface-hover\)/);
  assert.match(css, /\.git-action-anchor:active, \.git-action-anchor\.is-pressed \{[^}]*background: var\(--blue-bg\)/);
  assert.doesNotMatch(css, /\.git-action-tooltip/);
});

test('Dashboard table typography and compact branch spacing stay scoped; sidebar retains its 10px gap', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  const dashboard = readFileSync(new URL('../src/Dashboard.tsx', import.meta.url), 'utf8');
  assert.match(css, /--icon-label-gap:\s*10px/);
  assert.match(css, /--repository-detail-size:\s*11px/);
  assert.match(css, /\.remote-name small\s*\{[^}]*font-size:\s*var\(--repository-detail-size\)/);
  assert.doesNotMatch(css, /\.repository-visibility\s*\{\s*font-size:\s*9px/);
  assert.match(css, /\.remote-repo-table \.branch-label\s*\{[^}]*display:\s*inline-flex;[^}]*gap:\s*6px/);
  assert.match(css, /\.nav-item\s*\{[^}]*gap:\s*var\(--icon-label-gap\)/);
  assert.doesNotMatch(dashboard, /provider-mark/);
  assert.match(dashboard, /className="repository-visibility"/);
  assert.match(dashboard, /className="branch-label" title=\{branch\}><Icon[^>]*\/><span>/);
  assert.match(dashboard, /aria-label=\{`配置本地目录：/);
});

test('repository table icon tile derives its square size from both text lines and their gap', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  const sizing = css.match(/\.remote-repo-table\s*\{([^}]+)\}/)?.[1] || '';
  assert.match(sizing, /--repository-name-size: 12px; --repository-detail-size: 11px;/);
  assert.match(sizing, /--repository-text-leading: 1\.45; --repository-text-gap: 3px;/);
  assert.match(sizing, /--repository-icon-size: calc\(\(var\(--repository-name-size\) \+ var\(--repository-detail-size\)\) \* var\(--repository-text-leading\) \+ var\(--repository-text-gap\)\)/);
  assert.match(css, /\.remote-name strong, \.remote-name \.repository-link \{[^}]*font-size: var\(--repository-name-size\); line-height: var\(--repository-text-leading\)/);
  assert.match(css, /\.remote-name small \{[^}]*font-size: var\(--repository-detail-size\); line-height: var\(--repository-text-leading\);[^}]*margin-top: var\(--repository-text-gap\)/);
});

test('rounded repository tile centers the smaller folder and remains scoped to the table', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  const tile = css.match(/\.remote-name \.repository-icon-tile\.repository-disclosure \{([^}]+)\}/)?.[1] || '';
  assert.match(tile, /display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;/);
  assert.match(tile, /width: var\(--repository-icon-size\); height: var\(--repository-icon-size\)/);
  assert.match(tile, /border-radius: var\(--radius-control\)/);
  assert.match(tile, /color: var\(--blue\); background: var\(--blue-bg\)/);
  assert.match(tile, /border: 0;/);
  assert.match(tile, /box-shadow: none;/);
  assert.doesNotMatch(tile, /transform/);
  assert.doesNotMatch(css, /\.remote-name > svg/);
  assert.match(css, /--sidebar-icon-size: 19px;/);
  assert.match(css, /\.global-sidebar \.nav-item > svg, \.global-sidebar \.repository-logo > svg \{ width: var\(--sidebar-icon-size\); height: var\(--sidebar-icon-size\); \}/);
  assert.match(css, /\.global-sidebar \.repository-logo \{ width: var\(--sidebar-button-size\); height: var\(--sidebar-icon-size\)/);
});
