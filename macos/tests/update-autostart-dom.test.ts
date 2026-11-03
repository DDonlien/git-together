import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../package.json', import.meta.url));
const { JSDOM } = require('jsdom');
require.extensions['.css'] = () => {};

test('Update starts once, preserves failed operations, and leaves manual actions confirmable', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost', pretendToBeVisual: true });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'CustomEvent', 'MutationObserver']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, getComputedStyle: dom.window.getComputedStyle.bind(dom.window), requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window) });
  const { act, createElement, StrictMode } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { RepositoryActionDraftsProvider } = require('./src/RepositoryActionDialog.tsx');
  const { RepositoryOperationProvider, useRepositoryOperations } = require('./src/RepositoryOperationProvider.tsx');
  const target = (id: string) => ({ repositoryId: 'repo', repositoryName: 'owner/repo', task: { id, branch: id, head: 'a'.repeat(40), path: `/fixture/${id}`, files: [], tree: [], error: '' } });
  const calls: { prepare: string[]; apply: string[]; push: string[] } = { prepare: [], apply: [], push: [] };
  let failPreflight = false, failApply = false, failPush = false;
  Object.defineProperty(dom.window, 'gittogether', { configurable: true, value: { import: async (method: string, input: { repositoryId: string; taskId: string; mode?: string }) => {
    if (method === 'prepareSync') {
      calls.prepare.push(input.taskId);
      if (failPreflight && input.taskId === 'two') return { ok: false, error: '预检失败：需要先处理工作目录。' };
      return { ok: true, value: { id: `plan-${input.taskId}`, repositoryId: input.repositoryId, taskId: input.taskId, mode: input.mode, path: `/fixture/${input.taskId}`, branch: input.taskId, head: 'a'.repeat(40), remoteHead: 'b'.repeat(40), files: [], historyCommits: 0, protectedHistory: false, note: '将自动合并。', integration: 'merge' } };
    }
    if (method === 'discardSync') return { ok: true, value: { discarded: true } };
    throw new Error(`unexpected method ${method}`);
  } } });
  const onSync = async (input: { taskId: string }) => { calls.apply.push(input.taskId); if (failApply && input.taskId === 'two') throw new Error('第二个工作目录合并失败。'); return { taskId: input.taskId, mode: 'pull', head: 'c'.repeat(40), files: 0, reclaimedBytes: 0, protectedHistory: false }; };
  const onPush = async (input: { taskId: string }) => { calls.push.push(input.taskId); if (failPush) throw new Error('推送失败，请检查后重试。'); return { taskId: input.taskId, commitId: 'a'.repeat(40), pushed: true }; };
  const onCommit = async () => { throw new Error('unexpected commit'); };
  let mode: 'pull' | 'push' = 'pull', autoStart = true, targets = [target('one')];
  function Launcher() {
    const operations = useRepositoryOperations();
    return createElement('button', { onClick: () => operations.open({ mode, autoStart, targets, scope: 'fixture-scope', onSync, onPush, onCommit }) }, '打开操作');
  }
  const container = document.getElementById('root')!;
  let root = createRoot(container);
  const render = () => root.render(createElement(StrictMode, null, createElement(RepositoryActionDraftsProvider, { sessionId: 'fixture', children: createElement(RepositoryOperationProvider, { sessionId: 'fixture', children: createElement(Launcher) }) })));
  const open = () => [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === '打开操作')!;
  const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === label);
  const tick = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); }); };
  const reset = async () => { await act(async () => { root.unmount(); }); root = createRoot(container); calls.prepare.length = calls.apply.length = calls.push.length = 0; };
  try {
    // A successful Update Pull executes immediately after every preview succeeds.
    await act(async () => { render(); });
    await act(async () => { open().click(); }); await tick();
    assert.deepEqual(calls.apply, ['one']);
    assert.match(document.body.textContent || '', /Pull 已完成 · 已合并远端提交/);
    await act(async () => { open().click(); }); await tick();
    assert.deepEqual(calls.apply, ['one']);

    // A failure to prepare one target never executes or claims the other target.
    await reset(); failPreflight = true; targets = [target('one'), target('two')];
    await act(async () => { render(); });
    await act(async () => { open().click(); }); await tick();
    assert.deepEqual(calls.apply, []);
    assert.match(document.body.textContent || '', /预检失败/);
    failPreflight = false;
    await act(async () => { button('重新预览未完成目录')!.click(); }); await tick();
    assert.deepEqual(calls.apply, []);
    await act(async () => { button('确认 Pull')!.click(); }); await tick();
    assert.deepEqual(calls.apply, ['one', 'two']);

    // A later failed target does not erase the successful merge's result or rerun it.
    await reset(); targets = [target('one'), target('two')]; failApply = true;
    await act(async () => { render(); });
    await act(async () => { open().click(); }); await tick();
    assert.deepEqual(calls.apply, ['one', 'two']);
    assert.match(document.body.textContent || '', /Pull 已完成 · 已合并远端提交/);
    assert.match(document.body.textContent || '', /第二个工作目录合并失败/);
    failApply = false;
    const preparedBeforeRetry = calls.prepare.length;
    await act(async () => { button('重新预览未完成目录')!.click(); }); await tick();
    assert.deepEqual(calls.prepare.slice(preparedBeforeRetry), ['two']);
    assert.match(document.body.textContent || '', /Pull 已完成 · 已合并远端提交/);
    assert.deepEqual(calls.apply, ['one', 'two']);
    await act(async () => { button('确认 Pull')!.click(); }); await tick();
    assert.deepEqual(calls.apply, ['one', 'two', 'two']);

    // Ordinary Pull keeps the confirmation step.
    await reset(); autoStart = false; targets = [target('one')];
    await act(async () => { render(); });
    await act(async () => { open().click(); }); await tick();
    assert.deepEqual(calls.apply, []);
    await act(async () => { button('确认 Pull')!.click(); }); await tick();
    assert.deepEqual(calls.apply, ['one']);

    // Update Push is attempted once; folding and restoring a failed task does not retry it.
    await reset(); mode = 'push'; autoStart = true; failPush = true;
    await act(async () => { render(); });
    await act(async () => { open().click(); }); await tick();
    assert.deepEqual(calls.push, ['one']);
    assert.match(document.body.textContent || '', /推送失败，请检查后重试/);
    await act(async () => { document.querySelector<HTMLButtonElement>('[aria-label="收起 Push"]')!.click(); });
    await act(async () => { open().click(); }); await tick();
    assert.deepEqual(calls.push, ['one']);

    // Ordinary Push also waits for the user to confirm.
    await reset(); autoStart = false; failPush = false;
    await act(async () => { render(); });
    await act(async () => { open().click(); }); await tick();
    assert.deepEqual(calls.push, []);
    await act(async () => { button('Push')!.click(); }); await tick();
    assert.deepEqual(calls.push, ['one']);
  } finally {
    await act(async () => { root.unmount(); }); dom.window.close();
  }
});
