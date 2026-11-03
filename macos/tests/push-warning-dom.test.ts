import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../package.json', import.meta.url));
const { JSDOM } = require('jsdom');
require.extensions['.css'] = () => {};

test('a successful push with an LFS warning completes the batch without retrying', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost', pretendToBeVisual: true });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'CustomEvent', 'MutationObserver']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, getComputedStyle: dom.window.getComputedStyle.bind(dom.window), requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window) });
  const { act, createElement, useState } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { RepositoryActionDialog, RepositoryActionDraftsProvider } = require('./src/RepositoryActionDialog.tsx');
  const requests: string[] = [];
  let finished = 0;
  const warning = '推送已完成，但 LFS 下载未全部完成。';
  const target = (id: string) => ({ repositoryId: 'repo', repositoryName: 'owner/repo', task: { id, branch: id, head: 'a'.repeat(40), path: `/fixture/${id}`, files: [], tree: [], error: '' } });
  const targets = [target('one'), target('two')];
  const onPush = async (input: { taskId: string }) => {
    requests.push(input.taskId);
    return { taskId: input.taskId, commitId: 'b'.repeat(40), requestedCommitId: 'a'.repeat(40), pushed: true, ...(input.taskId === 'one' ? { warning } : {}) };
  };
  function Host() {
    const [feedback, setFeedback] = useState<{ message: string; complete?: boolean } | null>(null);
    return createElement(RepositoryActionDraftsProvider, { sessionId: 'push-warning', children: createElement('div', null,
      feedback && createElement('div', { role: 'status', 'data-kind': feedback.complete ? 'success' : 'warning' }, feedback.message),
      createElement(RepositoryActionDialog, { mode: 'push', targets, onCommit: async () => { throw new Error('unexpected commit'); }, onPush, onComplete: (message: string, complete?: boolean) => setFeedback({ message, complete }), onClose() {}, onFinished: () => { finished++; } }),
    ) });
  }
  const root = createRoot(document.getElementById('root')!);
  try {
    await act(async () => { root.render(createElement(Host)); });
    const push = [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === 'Push');
    assert.ok(push && !push.disabled);
    await act(async () => { push.click(); });
    assert.deepEqual(requests, ['one', 'two']);
    assert.equal(finished, 1);
    const feedback = document.querySelector<HTMLElement>('[data-kind="warning"]');
    assert.ok(feedback);
    assert.match(feedback.textContent || '', /已完成 2 个工作目录的推送/);
    assert.ok(feedback.textContent?.includes(warning));
    assert.equal(document.querySelectorAll('.notice.success').length, 2);
    assert.equal(document.querySelector('.notice.error'), null);
    assert.equal(push.disabled, true);
    await act(async () => { push.click(); });
    assert.deepEqual(requests, ['one', 'two']);
  } finally {
    await act(async () => { root.unmount(); });
    dom.window.close();
  }
});

test('a completed push warning survives a later failure, folding, and a manual retry', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost', pretendToBeVisual: true });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'CustomEvent', 'MutationObserver']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, getComputedStyle: dom.window.getComputedStyle.bind(dom.window), requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window) });
  const { act, createElement, useState } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { RepositoryActionDialog, RepositoryActionDraftsProvider } = require('./src/RepositoryActionDialog.tsx');
  const requests: string[] = [];
  const warning = '第一个工作目录已推送，但 LFS 下载未全部完成。';
  let failSecond = true, finished = 0;
  const target = (id: string) => ({ repositoryId: 'repo', repositoryName: 'owner/repo', task: { id, branch: id, head: 'a'.repeat(40), path: `/fixture/${id}`, files: [], tree: [], error: '' } });
  const targets = [target('one'), target('two')];
  const onPush = async (input: { taskId: string }) => {
    requests.push(input.taskId);
    if (input.taskId === 'two' && failSecond) throw new Error('第二个工作目录推送失败。');
    return { taskId: input.taskId, commitId: 'b'.repeat(40), requestedCommitId: 'a'.repeat(40), pushed: true, ...(input.taskId === 'one' ? { warning } : {}) };
  };
  function Host() {
    const [visible, setVisible] = useState(true);
    const [feedback, setFeedback] = useState<{ message: string; complete?: boolean } | null>(null);
    return createElement(RepositoryActionDraftsProvider, { sessionId: 'partial-push', children: createElement('div', null,
      createElement('button', { onClick: () => setVisible(true) }, '恢复任务'),
      feedback && createElement('div', { role: 'status', 'data-kind': feedback.complete ? 'success' : 'warning' }, feedback.message),
      createElement(RepositoryActionDialog, { mode: 'push', targets, onCommit: async () => { throw new Error('unexpected commit'); }, onPush, visible, onCollapse: () => setVisible(false), onComplete: (message: string, complete?: boolean) => setFeedback({ message, complete }), onClose() {}, onFinished: () => { finished++; } }),
    ) });
  }
  const root = createRoot(document.getElementById('root')!);
  const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === label);
  try {
    await act(async () => { root.render(createElement(Host)); });
    await act(async () => { button('Push')!.click(); });
    assert.deepEqual(requests, ['one', 'two']);
    assert.equal(finished, 0);
    assert.match(document.body.textContent || '', /第二个工作目录推送失败/);
    const first = [...document.querySelectorAll('section')].find(section => section.textContent?.includes('owner/repo · one'));
    assert.ok(first?.textContent?.includes('已 Push'));
    assert.ok(first?.textContent?.includes(warning));
    await act(async () => { document.querySelector<HTMLButtonElement>('[aria-label="收起 Push"]')!.click(); });
    await act(async () => { button('恢复任务')!.click(); });
    assert.ok(document.body.textContent?.includes(warning));
    assert.deepEqual(requests, ['one', 'two']);
    failSecond = false;
    await act(async () => { button('Push')!.click(); });
    assert.deepEqual(requests, ['one', 'two', 'two']);
    assert.equal(finished, 1);
    const feedback = document.querySelector<HTMLElement>('[data-kind="warning"]');
    assert.match(feedback?.textContent || '', /已完成 2 个工作目录的推送/);
    assert.ok(feedback?.textContent?.includes(warning));
    assert.ok(first?.textContent?.includes(warning));
    assert.equal(document.querySelectorAll('.notice.success').length, 2);
    assert.equal(button('Push')?.disabled, true);
  } finally {
    await act(async () => { root.unmount(); });
    dom.window.close();
  }
});
