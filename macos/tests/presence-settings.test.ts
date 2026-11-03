import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../package.json', import.meta.url));
const { JSDOM } = require('jsdom');
require.extensions['.css'] = () => {};

test('Presence adds inline and keeps login and logout scoped to the selected server', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost', pretendToBeVisual: true });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'CustomEvent', 'MutationObserver']) {
    Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
  }
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, getComputedStyle: dom.window.getComputedStyle.bind(dom.window), requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window) });
  const empty = { version: 1, enabled: true, configured: false, serverUrl: '', serverName: 'Presence', connection: 'disabled', error: '', localError: '', sessions: [], bridge: { connected: false, error: '', projects: [] }, account: null, servers: [], organizations: [] };
  const first = { id: 'a'.repeat(64), url: 'https://personal.example.test/', name: '个人 Presence', enabled: true, loggedIn: true, connection: 'connected', error: '', authMode: 'direct', account: null, accountSummary: { displayName: '个人 Presence', email: 'personal@example.test' }, issuerUrl: 'https://personal.example.test/' };
  const second = { id: 'b'.repeat(64), url: 'https://studio.example.test/', name: '工作室 Presence', enabled: true, loggedIn: true, connection: 'connected', error: '', authMode: 'direct', account: null, accountSummary: { displayName: '工作室 Presence', email: 'studio@example.test' }, issuerUrl: 'https://studio.example.test/' };
  let status: Record<string, unknown> = empty;
  let logoutFails = false;
  let logoutWarning = '';
  const actions: { method: string; input: Record<string, unknown> }[] = [];
  Object.defineProperty(dom.window, 'gittogether', { configurable: true, value: { presence: async (method: string, input: Record<string, unknown> = {}) => {
    if (method === 'status') return { ok: true, value: status };
    actions.push({ method, input: structuredClone(input) });
    if (method === 'openAccount') return { ok: true, value: status };
    if (method === 'login') return { ok: false, error: '登录未完成，请重试。' };
    if (method === 'logout') {
      if (logoutFails) return { ok: false, error: '退出请求失败，请重试。' };
      status = { ...status, error: logoutWarning, servers: (status.servers as typeof first[]).map(server => server.id === input.serverId ? { ...server, loggedIn: false, enabled: false, connection: 'disabled', account: null, accountSummary: null } : server) };
      return { ok: true, value: status };
    }
    throw new Error(`Unexpected mock Presence action: ${method}`);
  } } });
  const { act, createElement } = await import('react');
  const { createRoot } = await import('react-dom/client');
  // Require keeps the stylesheet imports under the isolated no-op CSS hook.
  const { PresenceProvider } = require('./src/PresenceProvider.tsx');
  const { PresenceSettings } = require('./src/PresenceSettings.tsx');
  let root = createRoot(document.getElementById('root')!);
  const buttons = (scope: ParentNode, text: string) => [...scope.querySelectorAll<HTMLButtonElement>('button')].filter(button => button.textContent?.trim() === text);
  const change = async (input: HTMLInputElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => { setter.call(input, value); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
  };
  const row = (url: string) => [...document.querySelectorAll<HTMLElement>('.setting-row')].find(element => element.textContent?.includes(url));
  const render = () => root.render(createElement(PresenceProvider, null, createElement(PresenceSettings)));
  try {
    await act(async () => { render(); });
    assert.equal(document.querySelector('form'), null);
    assert.equal(buttons(document, '添加').length, 1);
    assert.deepEqual(actions, []);
    await act(async () => { buttons(document, '添加')[0].click(); });
    let form = document.querySelector<HTMLFormElement>('form[aria-label="添加 Presence"]');
    assert.ok(form);
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(form.querySelector<HTMLInputElement>('input[type="url"]')?.value, '');
    assert.equal(form.querySelector<HTMLInputElement>('input[type="email"]')?.value, '');
    assert.equal(buttons(form, '创建账号')[0].disabled, true);
    const createAccountUrl = 'https://new.example.test/';
    await change(form.querySelector<HTMLInputElement>('input[type="url"]')!, createAccountUrl);
    assert.equal(buttons(form, '创建账号')[0].disabled, false);
    await act(async () => { buttons(form!, '创建账号')[0].click(); });
    assert.deepEqual(actions, [{ method: 'openAccount', input: { serverUrl: createAccountUrl } }]);
    await act(async () => { buttons(form!, '取消')[0].click(); });
    assert.equal(document.querySelector('form'), null);
    actions.length = 0;

    await act(async () => { root.unmount(); });
    status = { ...empty, configured: true, serverUrl: first.url, servers: [first, second], connection: 'connected' };
    root = createRoot(document.getElementById('root')!);
    await act(async () => { render(); });
    assert.ok(row(first.url));
    assert.ok(row(second.url));
    assert.equal(buttons(row(first.url)!, '重新登录').length, 1);
    assert.equal(buttons(row(second.url)!, '退出登录').length, 1);
    assert.equal(document.querySelector('form'), null);
    await act(async () => { buttons(row(second.url)!, '重新登录')[0].click(); });
    form = document.querySelector<HTMLFormElement>('form[aria-label="重新登录 Presence"]');
    assert.ok(form);
    const serverUrl = form.querySelector<HTMLInputElement>('input[type="url"]')!;
    const email = form.querySelector<HTMLInputElement>('input[type="email"]')!;
    const password = form.querySelector<HTMLInputElement>('input[type="password"]')!;
    assert.equal(serverUrl.value, second.url);
    assert.equal(serverUrl.readOnly, true);
    assert.equal(email.value, second.accountSummary.email);
    assert.equal(document.activeElement, email);
    await change(password, 'fixture-password-for-test');
    await act(async () => { form!.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); });
    assert.deepEqual(actions[0], { method: 'login', input: { serverId: second.id, serverUrl: second.url, email: second.accountSummary.email, password: 'fixture-password-for-test' } });
    assert.equal(document.querySelector('form[aria-label="重新登录 Presence"]'), form);
    assert.equal(password.value, 'fixture-password-for-test');
    assert.equal(email.value, second.accountSummary.email);
    assert.match(document.body.textContent || '', /登录未完成，请重试。/);
    await act(async () => { buttons(row(first.url)!, '重新登录')[0].click(); });
    form = document.querySelector<HTMLFormElement>('form[aria-label="重新登录 Presence"]');
    assert.ok(form);
    assert.equal(form.querySelector<HTMLInputElement>('input[type="url"]')?.value, first.url);
    assert.equal(form.querySelector<HTMLInputElement>('input[type="email"]')?.value, first.accountSummary.email);
    assert.equal(form.querySelector<HTMLInputElement>('input[type="password"]')?.value, '');
    assert.doesNotMatch(form.textContent || '', /登录未完成，请重试。/);
    await act(async () => { buttons(form!, '取消')[0].click(); });

    await act(async () => { buttons(row(second.url)!, '重新登录')[0].click(); });
    form = document.querySelector<HTMLFormElement>('form[aria-label="重新登录 Presence"]');
    assert.ok(form);
    await change(form.querySelector<HTMLInputElement>('input[type="password"]')!, 'preserve-second-form');
    logoutFails = true;
    await act(async () => { buttons(row(first.url)!, '退出登录')[0].click(); });
    assert.deepEqual(actions[1], { method: 'logout', input: { serverId: first.id } });
    assert.ok(row(first.url));
    assert.equal(document.querySelector('form[aria-label="重新登录 Presence"]'), form);
    assert.equal(form.querySelector<HTMLInputElement>('input[type="password"]')?.value, 'preserve-second-form');
    assert.match(document.body.textContent || '', /退出请求失败，请重试。/);
    assert.doesNotMatch(form.textContent || '', /退出请求失败/);
    logoutFails = false;
    logoutWarning = `${first.url}：本机已退出，服务器会话暂未撤销。`;
    await act(async () => { buttons(row(first.url)!, '退出登录')[0].click(); });
    assert.deepEqual(actions[2], { method: 'logout', input: { serverId: first.id } });
    assert.equal(row(first.url), undefined);
    assert.equal(buttons(row(second.url)!, '重新登录').length, 1);
    assert.equal(document.querySelector('form[aria-label="重新登录 Presence"]'), form);
    assert.match(document.body.textContent || '', /服务器会话暂未撤销/);
    assert.doesNotMatch(form.textContent || '', /服务器会话暂未撤销/);
    await act(async () => { buttons(form!, '取消')[0].click(); });
    assert.equal(buttons(document, '添加').length, 1);
    await act(async () => { buttons(document, '添加')[0].click(); });
    form = document.querySelector<HTMLFormElement>('form[aria-label="添加 Presence"]');
    assert.ok(form);
    for (const input of form.querySelectorAll<HTMLInputElement>('input')) assert.equal(input.value, '');
    assert.equal(form.querySelector<HTMLInputElement>('input[type="url"]')?.readOnly, false);
    assert.equal(actions.length, 3);
  } finally {
    await act(async () => { root.unmount(); });
    dom.window.close();
  }
});
