import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../desktop/package.json', import.meta.url));
const { JSDOM } = require('jsdom');

test('right-click and keyboard Ignore target the file without toggling selection, and are unavailable while busy', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost', pretendToBeVisual: true });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'CustomEvent', 'MutationObserver']) {
    Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
  }
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, getComputedStyle: dom.window.getComputedStyle.bind(dom.window), requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window) });
  const { act, createElement } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { RepositoryCommitFiles } = await import('../src/RepositoryCommitFiles');
  const root = createRoot(document.getElementById('root')!);
  const files = [{ path: '.DS_Store', status: 'M', tracked: true }, { path: 'new.txt', status: '??', tracked: false }];
  const ignored: string[] = [];
  let selections = 0;
  const props = { files, paths: files.map(file => file.path), branch: 'main', disabled: false, onChange: () => { selections++; }, onIgnore: (file: typeof files[number]) => { ignored.push(file.path); } };
  try {
    await act(async () => { root.render(createElement(RepositoryCommitFiles, props)); });
    const choices = document.querySelectorAll<HTMLButtonElement>('.submit-file-choice');
    await act(async () => { choices[0].dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 80 })); });
    let item = document.querySelector<HTMLElement>('[role="menuitem"]');
    assert.ok(item?.textContent?.includes('停止跟踪'));
    assert.equal(selections, 0);
    await act(async () => { item!.click(); });
    assert.deepEqual(ignored, ['.DS_Store']);

    await act(async () => { choices[1].dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true })); });
    item = document.querySelector<HTMLElement>('[role="menuitem"]');
    assert.ok(item?.textContent?.includes('忽略此文件'));
    await act(async () => { item!.click(); });
    assert.deepEqual(ignored, ['.DS_Store', 'new.txt']);
    assert.equal(selections, 0);

    await act(async () => { root.render(createElement(RepositoryCommitFiles, { ...props, disabled: true })); });
    await act(async () => { choices[0].dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true })); });
    assert.equal(document.querySelector('[role="menuitem"]'), null);
    assert.deepEqual(ignored, ['.DS_Store', 'new.txt']);
  } finally {
    await act(async () => { root.unmount(); });
    dom.window.close();
  }
});
