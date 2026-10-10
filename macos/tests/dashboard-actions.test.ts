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
  assert.equal((markup.match(/role="group"/g) || []).length, 1);
  assert.doesNotMatch(markup, /aria-haspopup|role="menu|role="separator"/);
  const actions = buttons(markup);
  assert.deepEqual(actions.map(action => action.attributes.match(/aria-label="([^"]+)"/)?.[1]), ['Commit', 'Fetch', 'Pull', 'Push', 'Get Latest', 'Reconcile', 'Clear']);
  assert.doesNotMatch(markup, /aria-label="Ignore/);
});

test('unimplemented Git actions are disabled, explained and never represent success', () => {
  {
    const markup = items();
    const actions = buttons(markup);
    for (const action of actions) {
      assert.match(action.attributes, /disabled=""/);
    }
    assert.doesNotMatch(markup, /已提交|已推送|操作成功/);
    assert.match(markup, /尚未接入执行，不会修改工作目录/);
    assert.match(markup, /aria-label="Get Latest[^"]*仅保留1层历史[^"]*清理旧 Git 历史与历史 LFS 缓存/);
    assert.match(markup, /aria-label="Reconcile[^"]*以本地为准[^"]*标记添加[^"]*本地版本并创建本地提交[^"]*本地缺少的忽略/);
    assert.match(markup, /aria-label="Clear[^"]*以远端为准[^"]*标记删除[^"]*恢复远端版本[^"]*本地缺少的下载/);
  }
});

test('each action retains disabled accessible detail without long hover or native-title prompts', () => {
  const markup = items();
  assert.match(markup, /aria-label="Git 操作：org\/shared · Personal"/);
  assert.equal((markup.match(/tabindex="0"/g) || []).length, 7);
  assert.equal((markup.match(/aria-disabled="true"/g) || []).length, 7);
  for (const action of buttons(markup)) assert.match(action.attributes, /title=""/);
  const source = readFileSync(new URL('../src/RepositoryActions.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /createPortal|role="tooltip"|onMouseMove|aria-describedby/);
  assert.match(source, /onPointerDown=/); assert.match(source, /onClick=/);
  assert.match(source, /onKeyDown=/); assert.match(source, /onKeyUp=/);
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.git-action-anchor:hover \{[^}]*background: var\(--surface-hover\)/);
  assert.match(css, /\.git-action-anchor:active, \.git-action-anchor\.is-pressed \{[^}]*background: var\(--blue-bg\)/);
  assert.doesNotMatch(css, /\.git-action-tooltip/);
});

test('Dashboard annotation styles scope the 2px reduction and share the 10px icon-label gap', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  const dashboard = readFileSync(new URL('../src/Dashboard.tsx', import.meta.url), 'utf8');
  assert.match(css, /--icon-label-gap:\s*10px/);
  assert.match(css, /--repository-detail-size:\s*11px/);
  assert.match(css, /\.remote-name small\s*\{[^}]*font-size:\s*var\(--repository-detail-size\)/);
  assert.doesNotMatch(css, /\.repository-visibility\s*\{\s*font-size:\s*9px/);
  assert.match(css, /\.remote-repo-table \.branch-label\s*\{[^}]*display:\s*inline-flex;[^}]*gap:\s*var\(--icon-label-gap\)/);
  assert.match(css, /\.nav-item\s*\{[^}]*gap:\s*var\(--icon-label-gap\)/);
  assert.doesNotMatch(dashboard, /provider-mark/);
  assert.match(dashboard, /className="repository-visibility"/);
  assert.match(dashboard, /className="branch-label" title=\{branch\}><Icon[^>]*\/><span>/);
  assert.match(dashboard, /aria-label=\{`配置本地目录：/);
});

test('repository table icon tile derives its square size from both text lines and their gap', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  const sizing = css.match(/\.remote-name\s*\{([^}]+)\}/)?.[1] || '';
  assert.match(sizing, /--repository-name-size: 12px; --repository-detail-size: 11px;/);
  assert.match(sizing, /--repository-text-leading: 1\.45; --repository-text-gap: 3px;/);
  assert.match(sizing, /--repository-icon-size: calc\(\(var\(--repository-name-size\) \+ var\(--repository-detail-size\)\) \* var\(--repository-text-leading\) \+ var\(--repository-text-gap\)\)/);
  assert.match(css, /\.remote-name \.repository-link \{[^}]*font-size: var\(--repository-name-size\); line-height: var\(--repository-text-leading\)/);
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
