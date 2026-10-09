import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SettingsView } from '../src/SettingsView';
import { AccountSignInOptions } from '../src/AccountSignInOptions';
import { emptyCatalog, githubVerificationURL } from '../src/import-model';
import type { WorkspaceController } from '../src/use-workspace';
import pkg from '../package.json';

test('settings retain accounts and appearance without guide, material or storage descriptions', () => {
  for (const credentialStorage of ['session', 'encrypted'] as const) {
    const catalog = { ...emptyCatalog, credentialStorage };
    const controller: WorkspaceController = {
      catalog,
      localStates: {},
      preferences: { theme: 'system', reducedGlass: false, collapsedAccounts: [] },
      loading: false, error: '', storageError: '', busy: {},
      service: { instanceId: 'test-session', version: pkg.version, githubWebAuth: false }, needsReload: false,
      updatePreferences: () => {}, reload: async () => {},
      connect: async () => catalog, updateAccount: async () => catalog, refresh: async () => catalog,
      removeAccount: async () => catalog, link: async () => catalog, unlink: async () => catalog,
      startGithubAuthorization: async () => ({ id: 'test-session', userCode: 'ABCD-EFGH', verificationURL: githubVerificationURL, expiresAt: Date.now() + 900000, interval: 5 }),
      pollGithubAuthorization: async () => ({ status: 'pending', retryAfter: 5 }),
      cancelGithubAuthorization: async () => ({ cancelled: true }),
    };
    const markup = renderToStaticMarkup(createElement(SettingsView, { controller, onDashboard: () => {} }));
    assert.deepEqual([...markup.matchAll(/<h2(?: [^>]*)?>(.*?)<\/h2>/g)].map(match => match[1]), ['账号', '外观', '应用更新']);
    assert.match(markup, /添加账号/);
    assert.match(markup, /颜色方案/);
    assert.doesNotMatch(markup, /减少透明度|使用更实的导航与控制层/);
    assert.equal(markup.match(/<div class="settings-heading">([\s\S]*?)<\/div>/)?.[1], '<h1>设置</h1>');
    assert.equal(markup.match(/<footer class="settings-footer">([\s\S]*?)<\/footer>/)?.[1], `GitTogether ${pkg.version}`);
    assert.equal((markup.match(/GitTogether /g) || []).length, 1);
    assert.ok(markup.indexOf('settings-footer') > markup.indexOf('<h2>外观</h2>'));
    assert.doesNotMatch(markup, /使用指南|import-guide|setting-material|OpenGlass UI · 浏览器材质|原生 Liquid Glass 已启用/);
    assert.doesNotMatch(markup, /storage-help|账号与令牌由系统安全存储加密保存|账号与令牌仅在服务会话中保存/);
  }
});

test('settings footer is flat, right aligned and shares the heading-to-account spacing without stacked margins', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  const footer = css.match(/\.settings-footer\s*\{([^}]+)\}/)?.[1] || '';
  assert.match(css, /\.settings-view\s*\{[^}]*--settings-heading-gap:\s*22px/);
  assert.match(css, /\.settings-heading\s*\{[^}]*margin-bottom:\s*var\(--settings-heading-gap\)/);
  assert.match(css, /\.settings-view\s*>\s*\.settings-section:last-of-type\s*\{\s*margin-bottom:\s*0;/);
  assert.match(footer, /padding-block:\s*var\(--settings-heading-gap\)/);
  assert.match(footer, /text-align:\s*right/);
  assert.doesNotMatch(footer, /border|box-shadow|background|position/);
});

test('GitHub defaults to a web authorization action without a token input; manual and Gitea remain available', () => {
  for (const [provider, manual, web] of [['github', false, true], ['github', true, false], ['gitea', false, false]] as const) {
    const markup = renderToStaticMarkup(createElement(AccountSignInOptions, { provider, manual, busy: false, disabled: false, token: '', onToken: () => {}, onManual: () => {}, onWebAuthorization: () => {} }));
    const footer = markup.match(/<div class="account-form-actions">([\s\S]*?)<\/div>/)?.[1];
    assert.ok(footer); assert.equal((footer.match(/<button\b/g) || []).length, 1);
    if (web) { assert.match(footer, /通过 GitHub 网页授权/); assert.doesNotMatch(markup, /type="password"/); assert.match(markup, /使用访问令牌/); }
    else { assert.match(footer, /type="submit"/); assert.match(footer, /连接账号/); assert.match(markup, /type="password"/); }
    assert.doesNotMatch(markup, /创建令牌。|在 Gitea 用户设置|只读取身份与仓库列表|storage-help/);
  }
});

test('account form retains the removed copy contract; authorization cannot submit during connection checks', () => {
  const source = readFileSync(new URL('../src/SettingsView.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /创建令牌。|在 Gitea 用户设置|只读取身份与仓库列表|storage-help/);
  for (const busy of [true, false]) {
    const markup = renderToStaticMarkup(createElement(AccountSignInOptions, { provider: 'github', manual: false, busy, disabled: true, token: '', onToken: () => {}, onManual: () => {}, onWebAuthorization: () => {} }));
    assert.match(markup.match(/<div class="account-form-actions">([\s\S]*?)<\/div>/)?.[1] || '', /disabled/);
  }
});

test('desktop authorization bridge opens only a fixed GitHub URL and validates the trusted main renderer', () => {
  const main = readFileSync(new URL('../electron/main.ts', import.meta.url), 'utf8');
  const handler = main.match(/ipcMain.handle\('gittogether:github-authorization',([\s\S]*?)\n\}\);/)?.[1];
  assert.ok(handler); assert.match(handler, /if \(!isMainRenderer\(event\)\)/);
  assert.match(main, /event\.sender === window\.webContents/);
  assert.match(main, /event\.senderFrame === window\.webContents\.mainFrame/);
  assert.match(main, /isTrustedRendererURL\(event\.senderFrame\.url, rendererSource\)/);
  assert.match(handler, /shell.openExternal\(githubVerificationURL\)/);
  assert.doesNotMatch(handler, /shell.openExternal\((?:url|input|value)/);
  const browser = readFileSync(new URL('../src/github-auth-flow.ts', import.meta.url), 'utf8');
  assert.match(browser, /window.open\(githubVerificationURL/); assert.match(browser, /popup.opener = null/);
  assert.doesNotMatch(browser, /window.open\((?:session|input|response)/);
});
