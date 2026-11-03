import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../desktop/package.json', import.meta.url));
const { JSDOM } = require('jsdom');

test('recent logs load only when expanded, search locally and refresh through the diagnostics bridge', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost', pretendToBeVisual: true });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'CustomEvent', 'MutationObserver']) {
    Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
  }
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, getComputedStyle: dom.window.getComputedStyle.bind(dom.window), requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window) });
  const common = { version: '0.38.11-lite.1', component: 'app', session: 'a24ec58b-62fd-48a8-b738-2416d10f8ea2' };
  const records = [
    { ...common, time: '2026-11-02T02:03:00.000Z', event: 'authorization', outcome: 'failure', method: 'start', code: 'permission' },
    { ...common, time: '2026-11-02T02:02:00.000Z', event: 'git-read', outcome: 'success', verb: 'log', provider: 'gitea', durationMs: 13 },
  ];
  let recentReads = 0;
  let statusReads = 0;
  Object.defineProperty(dom.window, 'gittogether', { configurable: true, value: { diagnostics: {
    status: async () => { statusReads++; return { directory: '/fixture/logs', retentionHours: 168, maxBytes: 512 * 1024 * 1024, limited: true, capacityLimited: true, capacityPruned: false, writePaused: true, error: '日志达到空间上限，当前日志文件已保留，写入已暂停；仍可查看、打开或复制现有日志，下一小时轮换后会重试写入。' }; },
    recent: async () => { recentReads++; return { records: recentReads === 1 ? records : [{ ...common, time: '2026-11-02T02:04:00.000Z', event: 'update', outcome: 'available', method: 'check' }, ...records], truncated: false, hasOlder: recentReads > 1, files: 1, totalBytes: 2048, returnedBytes: 2048, maxRecords: 500, maxBytes: 262144, oldestTime: records[1].time, newestTime: recentReads === 1 ? records[0].time : '2026-11-02T02:04:00.000Z' }; },
    record: async () => true,
    open: async () => { throw new Error('This test must not open user log files.'); },
    copy: async () => { throw new Error('This test must not copy user log files.'); },
  } } });
  const { act, createElement } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { DiagnosticsSettings } = await import('../src/DiagnosticsSettings');
  const root = createRoot(document.getElementById('root')!);
  const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === label || item.getAttribute('aria-label') === label);
  try {
    await act(async () => { root.render(createElement(DiagnosticsSettings)); });
    assert.equal(statusReads, 1);
    assert.equal(recentReads, 0);
    assert.equal(button('打开日志文件夹')?.disabled, false);
    assert.equal(button('复制日志文件到剪贴板')?.disabled, false);
    assert.match(document.body.textContent || '', /日志空间已满，暂时停止写入；现有日志仍可查看。/);
    assert.doesNotMatch(document.body.textContent || '', /已移除较早记录|下一小时轮换/);
    assert.equal(document.querySelector('[aria-label="最近日志"]'), null);
    assert.equal(button('查看日志')?.getAttribute('aria-expanded'), 'false');

    await act(async () => { button('查看日志')!.click(); });
    assert.equal(recentReads, 1);
    assert.equal(button('收起日志')?.getAttribute('aria-expanded'), 'true');
    const viewer = document.querySelector<HTMLElement>('[aria-label="最近日志"]');
    assert.ok(viewer);
    assert.equal(viewer.querySelectorAll('details').length, 2);
    assert.match(viewer.textContent || '', /界面最多显示 500 条；日志文件最多保留 7 天、512 MB（先到上限为准）。/);
    assert.match(viewer.textContent || '', /最近 2 条 · 最新在前/);
    assert.match(viewer.textContent || '', /网页授权/);
    assert.match(viewer.textContent || '', /Git 读取/);
    assert.match(viewer.textContent || '', /失败/);
    const search = viewer.querySelector<HTMLInputElement>('input[type="search"]');
    assert.ok(search);
    const setValue = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => { setValue.call(search, '失败'); search.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
    assert.equal(recentReads, 1);
    assert.equal(viewer.querySelectorAll('details').length, 1);
    assert.match(viewer.querySelector('details')?.textContent || '', /authorization/);

    await act(async () => { setValue.call(search, 'gitea'); search.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
    assert.equal(recentReads, 1);
    assert.equal(viewer.querySelectorAll('details').length, 1);
    assert.match(viewer.querySelector('details')?.textContent || '', /git-read/);
    await act(async () => { setValue.call(search, 'not-in-this-fixture'); search.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
    assert.equal(viewer.querySelectorAll('details').length, 0);
    assert.match(viewer.textContent || '', /没有.*(匹配|符合)/);

    await act(async () => { setValue.call(search, ''); search.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
    await act(async () => { button('刷新日志')!.click(); });
    assert.equal(recentReads, 2);
    assert.equal(viewer.querySelectorAll('details').length, 3);
    assert.match(viewer.textContent || '', /读取到的 3 条 · 按时间倒序/);
    assert.match(viewer.textContent || '', /这里只显示部分近期记录；其他记录可在日志文件夹中查看。搜索仅限当前记录。/);
    assert.doesNotMatch(viewer.textContent || '', /最新在前|更早记录/);
    await act(async () => { button('收起日志')!.click(); });
    assert.equal(document.querySelector('[aria-label="最近日志"]'), null);
    assert.equal(recentReads, 2);
  } finally {
    await act(async () => { root.unmount(); });
    dom.window.close();
  }
});
