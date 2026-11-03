import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../package.json', import.meta.url));
const { JSDOM } = require('jsdom');
require.extensions['.css'] = () => {};

test('Update dispatches only the eligible worktrees and changes action with state', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'CustomEvent', 'MutationObserver']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, getComputedStyle: dom.window.getComputedStyle.bind(dom.window), requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window) });
  const { act, createElement } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { RepositoryActions } = require('./src/RepositoryActions.tsx');
  const { RepositoryOperationProvider } = require('./src/RepositoryOperationProvider.tsx');
  const { RepositoryActionDraftsProvider } = require('./src/RepositoryActionDialog.tsx');
  const { gitSignals } = require('./src/branch-links.ts');
  const signals = gitSignals([], { workspace: null, loading: false, error: '' });
  const target = (id: string, ahead: number | null, behind: number | null) => ({ repositoryId: 'repo', repositoryName: 'owner/repo', task: { id, branch: id, head: 'a'.repeat(40), path: `/fixture/${id}`, files: [], tree: [], error: '', tracking: { upstream: 'origin/main', ahead, behind } } });
  const calls: { mode: string; targets: string[] }[] = [];
  let targets = [target('mac', 1, 2), target('other', 3, 0)];
  const props = () => ({ label: 'Git 操作', signals, operationTargets: targets, onFetch: () => calls.push({ mode: 'fetch', targets: [] }), onPull() {}, onPush() {}, onUpdate: (mode: string, selected: typeof targets) => calls.push({ mode, targets: selected.map(item => item.task.id) }) });
  const root = createRoot(document.getElementById('root')!);
  const render = () => root.render(createElement(RepositoryActionDraftsProvider, { sessionId: 'update-test', children: createElement(RepositoryOperationProvider, { sessionId: 'update-test', children: createElement(RepositoryActions, props()) }) }));
  const update = () => document.querySelector<HTMLButtonElement>('.repository-update-group button')!;
  try {
    await act(async () => { render(); });
    assert.match(update().getAttribute('aria-label') || '', /Update · Pull/);
    await act(async () => { update().click(); });
    assert.deepEqual(calls, [{ mode: 'pull', targets: ['mac'] }]);
    targets = [target('mac', 2, 0), target('other', 3, 0)];
    await act(async () => { render(); });
    assert.match(update().getAttribute('aria-label') || '', /Update · Push/);
    await act(async () => { update().click(); });
    assert.deepEqual(calls[1], { mode: 'push', targets: ['mac', 'other'] });
    targets = [target('mac', 2, 0), target('other', null, null)];
    await act(async () => { render(); });
    assert.match(update().getAttribute('aria-label') || '', /Update · Fetch/);
    await act(async () => { update().click(); });
    assert.deepEqual(calls[2], { mode: 'fetch', targets: [] });
  } finally {
    await act(async () => { root.unmount(); });
    dom.window.close();
  }
});
