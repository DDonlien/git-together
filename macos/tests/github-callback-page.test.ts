import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { callbackContent, callbackScript, callbackStyles } from '../server/github-callback-page';

// Execute the production inline script in a synthetic DOM with a controlled
// clock. This is logic QA, not evidence of a real user's OAuth completion.
function pageFixture() {
  const nodes = new Map(['page-title', 'oauth-status', 'oauth-detail', 'oauth-elapsed', 'oauth-heartbeat', 'oauth-slow'].map(id => [id, { textContent: '', hidden: true }]));
  const attributes = new Map<string, string>();
  let time = 0, nextTimer = 0, closes = 0, cleanURL = '';
  const intervals = new Map<number, () => void>(), timers = new Map<number, () => void>();
  const requests: { url: string; init: RequestInit; resolve(value: unknown): void; reject(error: Error): void }[] = [];
  runInNewContext(callbackScript('00000000-0000-0000-0000-000000000001'), {
    document: { title: '', getElementById: (id: string) => nodes.get(id), documentElement: { setAttribute: (name: string, value: string) => attributes.set(name, value) } },
    history: { replaceState: (_value: unknown, _title: string, url: string) => { cleanURL = url; } },
    performance: { now: () => time }, window: { close: () => { closes++; } },
    fetch: (url: string, init: RequestInit) => new Promise((resolve, reject) => requests.push({ url, init, resolve, reject })),
    AbortSignal: { timeout: (duration: number) => { assert.equal(duration, 15000); return new AbortController().signal; } },
    setInterval: (fn: () => void, ms: number) => { assert.equal(ms, 1000); intervals.set(++nextTimer, fn); return nextTimer; },
    setTimeout: (fn: () => void, ms: number) => { assert.equal(ms, 500); timers.set(++nextTimer, fn); return nextTimer; },
    clearInterval: (id: number) => intervals.delete(id), clearTimeout: (id: number) => timers.delete(id),
  });
  const flush = async () => { for (let n = 0; n < 8; n++) await Promise.resolve(); };
  return {
    node: (id: string) => nodes.get(`oauth-${id}`)!, attributes, requests,
    cleanURL: () => cleanURL, closes: () => closes, intervalCount: () => intervals.size, timerCount: () => timers.size,
    advance: (ms: number) => { time += ms; for (const fn of intervals.values()) fn(); },
    nextPoll: () => { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } },
    respond: async (value: unknown, ok = true) => { requests.at(-1)!.resolve({ ok, json: async () => value }); await flush(); },
    fail: async (error: Error) => { requests.at(-1)!.reject(error); await flush(); },
  };
}

test('callback markup is flat, readable without scripts and motion is reduced or stopped at terminal states', () => {
  const content = callbackContent('http://127.0.0.1:4173');
  assert.match(content, /正在交换授权结果/); assert.match(content, /已等待 0 秒/); assert.match(content, /role="status" aria-live="polite"/);
  assert.match(content, /aria-hidden="true"/); assert.match(content, /id="oauth-elapsed" aria-live="off"/); assert.match(content, /<noscript>/);
  assert.match(content, /href="http:\/\/127\.0\.0\.1:4173\/"/);
  assert.match(callbackStyles, /@media\(prefers-reduced-motion:reduce\)\{\.oauth-spinner\{animation:none\}\}/);
  assert.match(callbackStyles, /\[data-status=complete\] \.oauth-spinner,\[data-status=failed\] \.oauth-spinner,\[data-status=unknown\] \.oauth-spinner\{display:none;animation:none\}/);
  assert.doesNotMatch(callbackStyles, /box-shadow|backdrop-filter/);
  assert.doesNotMatch(content, /progressbar|aria-valuenow|%|client_secret|access_token/);
});

test('callback timer and stale heartbeat cannot manufacture phase advancement or endless unnoticed waiting', async () => {
  const f = pageFixture();
  assert.equal(f.cleanURL(), '/oauth/github/callback'); assert.equal(f.attributes.get('data-status'), 'pending');
  const { url, init } = f.requests[0]; assert.equal(url, '/api/callback-status');
  assert.equal(init.method, 'POST'); assert.equal(init.credentials, 'omit'); assert.equal(init.redirect, 'error');
  assert.equal(new Headers(init.headers).get('X-GitTogether-Client'), '1');
  await f.respond({ ok: true, value: { status: 'pending', phase: 'exchanging' } });
  f.advance(15_000);
  assert.equal(f.node('status').textContent, '正在交换授权结果');
  assert.equal(f.node('elapsed').textContent, '已等待 15 秒'); assert.equal(f.node('heartbeat').textContent, '状态更新于 15 秒前');
  assert.equal(f.node('slow').hidden, false);
  f.nextPoll(); await f.respond({ ok: true, value: { status: 'pending', phase: 'exchanging' } });
  assert.equal(f.node('heartbeat').textContent, '状态刚刚更新'); assert.equal(f.node('slow').hidden, false);
  f.nextPoll(); await f.respond({ ok: true, value: { status: 'pending', phase: 'verifying' } });
  assert.equal(f.node('status').textContent, '正在核对 GitHub 账号'); assert.equal(f.node('slow').hidden, true);
  assert.equal(f.node('elapsed').textContent, '已等待 15 秒');
  f.nextPoll(); await f.respond({ ok: true, value: { status: 'pending', phase: 'importing' } });
  assert.equal(f.node('status').textContent, '正在导入账号与仓库');
  assert.equal(f.attributes.get('data-status'), 'pending'); assert.equal(f.closes(), 0);
});

test('confirmed success stops polling, clock and motion before attempting to close the window', async () => {
  const f = pageFixture(); f.advance(4_000);
  await f.respond({ ok: true, value: { status: 'complete' } });
  assert.equal(f.attributes.get('data-status'), 'complete'); assert.equal(f.node('status').textContent, '账号已连接');
  assert.equal(f.node('elapsed').textContent, '用时 4 秒'); assert.equal(f.node('heartbeat').textContent, '已完成');
  assert.equal(f.node('slow').hidden, true); assert.equal(f.intervalCount(), 0); assert.equal(f.timerCount(), 0); assert.equal(f.closes(), 1);
  f.advance(30_000); f.nextPoll(); assert.equal(f.node('elapsed').textContent, '用时 4 秒'); assert.equal(f.requests.length, 1);
});

test('confirmed failure leaves safe readable text, stops motion and never attempts to close', async () => {
  const f = pageFixture(); f.advance(20_000);
  await f.respond({ ok: false, error: '授权已过期，请重新开始。' }, false);
  assert.equal(f.attributes.get('data-status'), 'failed'); assert.equal(f.node('detail').textContent, '授权已过期，请重新开始。');
  assert.equal(f.node('status').textContent, '授权未完成'); assert.equal(f.node('slow').hidden, true);
  assert.equal(f.intervalCount(), 0); assert.equal(f.timerCount(), 0); assert.equal(f.closes(), 0);
});

test('lost status, request timeout and invalid phases say the result is unknown, not that import was rolled back', async () => {
  for (const state of ['network', 'invalid', 'timeout']) {
    const f = pageFixture();
    if (state === 'invalid') await f.respond({ ok: true, value: { status: 'pending', phase: '__proto__' } });
    else if (state === 'timeout') await f.fail(new DOMException('Fixture', 'TimeoutError'));
    else await f.fail(new TypeError('Fixture connection lost'));
    assert.equal(f.attributes.get('data-status'), 'unknown');
    assert.match(f.node('detail').textContent, /后台可能仍在处理/); assert.match(f.node('detail').textContent, /不要重复提交/);
    assert.equal(f.node('heartbeat').textContent, '结果尚未确认'); assert.equal(f.intervalCount(), 0); assert.equal(f.timerCount(), 0); assert.equal(f.closes(), 0);
  }
});
