import { sourceState } from './source-state.mjs';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const root = resolve(import.meta.dirname, '..');
const build = JSON.parse(readFileSync(join(root, 'desktop/out/build-info.json'), 'utf8'));
assert.equal(build.sourceSha256, sourceState(root), 'Rebuild changed sources first.');
const require = createRequire(join(root, 'desktop/package.json'));
const { _electron } = require('playwright');
const fixture = mkdtempSync(join(tmpdir(), 'gittogether-material-ui-'));
const output = join(root, 'artifacts/github-desktop-material'); mkdirSync(output, { recursive: true });
const repo = join(fixture, 'design-fixture');
const fixtureGitEnv = { ...process.env, GIT_CONFIG_GLOBAL: join(fixture, 'gitconfig'), GIT_CONFIG_NOSYSTEM: '1' };
function git(args, cwd = fixture) { return execFileSync('git', args, { cwd, env: fixtureGitEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
git(['init', '--initial-branch=main', repo]);
git(['config', 'user.name', 'Material Fixture'], repo); git(['config', 'user.email', 'fixture@example.invalid'], repo); git(['config', 'commit.gpgsign', 'false'], repo);
writeFileSync(join(repo, 'readme.txt'), 'base\n'); git(['add', '.'], repo); git(['commit', '-m', 'base'], repo);
git(['switch', '-c', 'feature'], repo); writeFileSync(join(repo, 'readme.txt'), 'feature\n'); git(['commit', '-am', 'feature version'], repo);
git(['switch', 'main'], repo); writeFileSync(join(repo, 'readme.txt'), 'main\n'); git(['commit', '-am', 'main version'], repo);
const initialHead = git(['rev-parse', 'HEAD'], repo);
const app = await _electron.launch({ executablePath: join(root, 'desktop/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), args: ['--allow-file-access-from-files', '--user-data-dir=' + join(fixture, 'profile'), join(root, 'desktop/out')], env: { ...fixtureGitEnv, GITTOGETHER_SMOKE: '1', NODE_ENV: 'development' }, timeout: 60_000 });
const report = { ok: false, build, fixture, checks: [], screenshots: [], unverified: ['real-user OAuth consent', 'real-server credentials', 'Windows runtime', 'real-device Presence authorization'] };
let page, frame, repositoryId;
const errors = [];
try {
  page = await app.firstWindow(); page.on('pageerror', e => errors.push(e.message));
  await page.waitForFunction(() => window.__gittogetherAdapter);
  await page.evaluate(async path => { await window.__gittogetherAdapter.handle('link', { repositoryId: '', path }); }, repo);
  repositoryId = await page.evaluate(path => window.__gittogetherAdapter.catalog().then(c => c.links.find(l => l.path === path).repositoryId), repo);
  frame = page.frames().find(f => f.url().includes('/gittogether/index.html')); assert.ok(frame);
  await frame.waitForSelector('.global-sidebar');
  await page.evaluate(async id => { const a = window.__gittogetherAdapter; await a.dispatcher.selectRepository(await a.repository(id)); }, repositoryId);
  const theme = async value => { await frame.evaluate(value => window.gittogether.setTheme(value), value); await page.waitForFunction(value => document.documentElement.dataset.theme === value, value); };
  const show = async (type, extra = {}) => {
    await page.evaluate(async ({ id, type, extra }) => {
      const a = window.__gittogetherAdapter, repository = await a.repository(id);
      const callbacks = {
        onSubmit: (...values) => { window.__fixtureResult = values; a.dispatcher.closePopup(type); },
        onDismiss: () => { window.__fixtureDismissed = true; },
        resolve: value => { window.__fixtureResult = value; },
      };
      window.__fixtureResult = null;
      a.dispatcher.showPopup({ ...callbacks, repository, type, ...extra });
    }, { id: repositoryId, type, extra });
    await page.locator(`dialog.gt-dialog[open][data-gittogether-surface="${type}"]`).waitFor();
  };
  const close = async () => {
    await page.waitForTimeout(300);
    await page.locator('dialog[open] button.close').click();
    await page.locator('dialog[open]').waitFor({ state: 'hidden' });
  };
  const capture = async name => {
    await page.waitForTimeout(300);
    const modal = page.locator('dialog[open]');
    if (await modal.count()) {
      const state = await modal.evaluate(el => ({ material: el.classList.contains('gt-dialog'), radius: getComputedStyle(el).borderRadius, width: el.getBoundingClientRect().width, viewport: innerWidth, overflow: el.scrollWidth > el.clientWidth + 1, rawIcons: el.querySelectorAll('.octicon').length, oldArtwork: [...el.querySelectorAll('img')].some(img => /static\/(?:logo|welcome|ghd_|empty-|paper-stack)/.test(img.src)) }));
      assert.equal(state.material, true); assert.equal(state.radius, '28px'); assert.equal(state.overflow, false, name); assert.ok(state.width <= state.viewport); assert.equal(state.rawIcons, 0); assert.equal(state.oldArtwork, false);
    }
    assert.equal(await page.locator('#desktop-app-chrome, #desktop-app-toolbar, #desktop-app-contents, .welcome-graphic').count(), 0);
    const filename = `${name}.png`; await page.screenshot({ path: join(output, filename) }); report.screenshots.push(filename);
  };
  await theme('light');
  await page.evaluate(() => window.__gittogetherAdapter.dispatcher.showDotComSignInDialog());
  await page.locator('dialog[open][data-gittogether-surface=SignIn]').waitFor();
  await capture('sign-in-light'); assert.match(await page.locator('dialog[open]').innerText(), /浏览器/); await close();
  await theme('dark');
  await page.evaluate(() => window.__gittogetherAdapter.dispatcher.showDotComSignInDialog());
  await page.locator('dialog[open]').waitFor(); await capture('sign-in-dark'); await close();
  report.checks.push('GitHub sign-in uses the original controller, with our light/dark Material dialog and no OAuth request');
  await theme('light');
  await show('GenericGitAuthentication', { remoteUrl: 'https://git.example.invalid/team/project.git' });
  await page.locator('dialog[open] input[type=text]').fill('fixture-user'); await page.locator('dialog[open] input[type=password]').fill('fixture-password');
  assert.ok(await page.locator('dialog[open] .password-text-box').evaluate(el => el.getBoundingClientRect().width > 350));
  await capture('credentials-light'); await page.locator('dialog[open] button[type=submit]').click();
  await page.waitForFunction(() => Array.isArray(window.__fixtureResult)); assert.equal(await page.evaluate(() => window.__fixtureResult[0]), 'fixture-user');
  await page.locator('dialog[open]').waitFor({ state: 'hidden' });
  await show('SSHKeyPassphrase', { keyPath: '/fixture/keys/id_ed25519' });
  await page.locator('dialog[open] input[type=password]').fill('fixture-passphrase'); await capture('ssh-key-light');
  await page.locator('dialog[open] button[type=submit]').click();
  await page.waitForFunction(() => Array.isArray(window.__fixtureResult)); assert.equal(await page.evaluate(() => window.__fixtureResult[1]), false);
  await page.locator('dialog[open]').waitFor({ state: 'hidden' });
  await show('AddSSHHost', { host: 'git.example.invalid', ip: '192.0.2.1', keyType: 'ED25519', fingerprint: 'SHA256:fixture-fingerprint-for-presentation-only' });
  await capture('ssh-host-light'); await close(); assert.equal(await page.evaluate(() => window.__fixtureResult[0]), false);
  report.checks.push('Generic credentials and SSH inputs still invoke original callbacks; rejecting a host remains a rejection');
  await page.evaluate(async id => { const a = window.__gittogetherAdapter; a.dispatcher.showPopup({ type: 'InitializeLFS', repositories: [await a.repository(id)] }); }, repositoryId);
  await page.locator('dialog[open]').waitFor(); await capture('lfs-light'); await close();
  await show('ConfirmForcePush', { upstreamBranch: 'origin/main' }); await capture('force-push-light');
  assert.match(await page.locator('dialog[open] .button-group.destructive button[type=submit]').innerText(), /Cancel|取消/); await close();
  writeFileSync(join(repo, 'draft.txt'), 'keep on cancel\n');
  await page.evaluate(async id => { const a = window.__gittogetherAdapter, repository = await a.repository(id); await a.dispatcher.refreshRepository(repository); a.dispatcher.showPopup({ type: 'ConfirmDiscardChanges', repository, files: a.cache.get(repository).changesState.workingDirectory.files, discardingAllChanges: true }); }, repositoryId);
  await page.locator('dialog[open]').waitFor(); await capture('discard-light'); await close(); assert.ok(existsSync(join(repo, 'draft.txt')));
  await page.evaluate(async id => { const a = window.__gittogetherAdapter, r = await a.repository(id); await a.dispatcher.discardChanges(r, a.cache.get(r).changesState.workingDirectory.files, true); }, repositoryId);
  report.checks.push('LFS, force push and discard are Material; destructive confirmation keeps the original safe default and cancel preserves files');
  await page.evaluate(() => window.__gittogetherAdapter.dispatcher.showPopup({ type: 'Error', error: new Error('GitHub Desktop is fixture content, preserve it verbatim.') }));
  await page.locator('dialog[open]').waitFor();
  assert.match(await page.locator('dialog[open] .dialog-content').innerText(), /GitHub Desktop is fixture content, preserve it verbatim/);
  await close();
  await page.evaluate(() => window.__gittogetherAdapter.dispatcher.showPopup({ type: 'Error', error: new Error('无法读取临时测试仓库。\n' + '长路径与错误详情用于检查换行和滚动。'.repeat(35)) }));
  await page.locator('dialog[open]').waitFor(); await capture('error-long-light'); await close();
  await show('Preferences');
  for (const label of ['账号', '编辑器与终端', 'Git', '外观', '通知', '操作确认', '高级', '辅助功能']) {
    await page.getByRole('tab', { name: label, exact: true }).click();
    await capture('settings-' + ({ '账号': 'accounts', '编辑器与终端': 'tools', Git: 'git', '外观': 'appearance', '通知': 'notifications', '操作确认': 'prompts', '高级': 'advanced', '辅助功能': 'accessibility' })[label]);
  }
  await close();
  await show('RepositorySettings');
  for (const label of ['远端连接', '忽略文件', 'Git 身份']) {
    await page.getByRole('tab', { name: label, exact: true }).click(); await capture('repository-settings-' + ({ '远端连接': 'remote', '忽略文件': 'ignore', 'Git 身份': 'identity' })[label]);
  }
  await close();
  await show('About'); await capture('about-light'); await close();
  await show('AddRepository', { path: repo }); await capture('add-repository-light'); await close();
  await show('CreateRepository', { path: fixture }); await capture('create-repository-light'); await close();
  await show('CloneRepository', { initialURL: null }); await capture('clone-light'); await close();
  await show('AddWorktree'); await capture('worktree-light'); await close();
  report.checks.push('Application and repository settings tabs, About, add/create/clone and worktree forms use our layouts and shared controls');
  // Enter the real workspace before invoking repository-specific commands.
  await frame.locator('.repository-link').filter({ hasText: 'design-fixture' }).click();
  await frame.waitForSelector('.repository-workspace-view');
  await page.waitForFunction(() => window.__gittogetherAdapter.store.getState().selectedState?.repository.gitDir !== undefined);
  await page.evaluate(async id => { const a = window.__gittogetherAdapter; await a.dispatcher.startMergeBranchOperation(await a.repository(id), false); }, repositoryId);
  await page.locator('dialog[open][data-gittogether-surface=MultiCommitOperation]').waitFor(); await capture('merge-choose-light');
  await page.getByRole('option').filter({ hasText: 'feature' }).first().click();
  await page.locator('dialog[open] .dropdown-button').click(); await page.locator('.gt-floating-menu:popover-open').waitFor(); await capture('merge-options-light'); await page.keyboard.press('Escape'); await page.locator('.gt-floating-menu').waitFor({ state: 'hidden' });
  await page.locator('dialog[open] button[type=submit]').click();
  await page.waitForFunction(() => document.querySelector('dialog[open]')?.textContent.includes('readme.txt'));
  await capture('merge-conflicts-light');
  await page.locator('dialog[open]').getByRole('button', { name: /Abort merge|中止合并/i }).click();
  await page.waitForFunction(() => !document.querySelector('dialog[open]'));
  assert.equal(existsSync(join(repo, '.git/MERGE_HEAD')), false); assert.equal(git(['rev-parse', 'HEAD'], repo), initialHead);
  report.checks.push('A real original merge creates a conflict in the Material flow; the original Abort action restores the pre-merge HEAD');
  const hook = join(repo, '.git/hooks/pre-commit'); writeFileSync(hook, '#!/bin/sh\nprintf "fixture hook failed\\n"\nexit 1\n'); chmodSync(hook, 0o755);
  writeFileSync(join(repo, 'readme.txt'), 'uncommitted draft\n');
  const commit = page.evaluate(async id => {
    const a = window.__gittogetherAdapter, repository = await a.repository(id); await a.dispatcher.refreshRepository(repository);
    const workspace = await a.workspace(id), task = workspace.tasks[0];
    try { await a.handle('submitCommit', { repositoryId: id, taskId: task.id, expectedHead: task.head, changeKey: task.changeKey, summary: 'must be aborted', description: '', operationId: crypto.randomUUID() }); return 'unexpected success'; }
    catch (error) { return error.message; }
  }, repositoryId);
  await page.locator('dialog[open][data-gittogether-surface=HookFailed]').waitFor(); await capture('hook-failed-light');
  assert.match(await page.locator('dialog[open] .button-group.destructive button[type=submit]').innerText(), /Abort|中止/);
  await page.locator('dialog[open]').getByRole('button', { name: /^(Abort|中止)$/ }).click();
  assert.notEqual(await commit, 'unexpected success'); assert.equal(git(['rev-parse', 'HEAD'], repo), initialHead); assert.equal(readFileSync(join(repo, 'readme.txt'), 'utf8'), 'uncommitted draft\n');
  report.checks.push('A real failing pre-commit hook displays its output in our terminal palette; Abort preserves the draft and HEAD');
  // The original commit cancellation can add an error. Dismiss it through our UI.
  while (await page.locator('dialog[open]').count()) await close();
  await theme('dark'); await show('RepositorySettings'); await capture('repository-settings-dark'); await close();
  await page.evaluate(() => window.__gittogetherAdapter.dispatcher.showPopup({ type: 'Error', error: new Error('测试暗色错误提示，操作尚未完成。') }));
  await page.locator('dialog[open]').waitFor(); await capture('error-dark'); await close();
  await show('HookFailed', { hookName: 'pre-push', terminalOutput: 'fixture output in dark theme\r\n' }); await capture('hook-failed-dark'); await close();
  await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.setMinimumSize(600, 500); window.setSize(800, 700); });
  await page.evaluate(() => window.__gittogetherAdapter.dispatcher.showDotComSignInDialog());
  await page.locator('dialog[open]').waitFor(); await capture('sign-in-dark-800'); await close();
  report.checks.push('Dark and narrow-window layouts retain Material color roles, scroll bounds and accessible focus');
  const crashPageReady = app.waitForEvent('window');
  const crashId = await app.evaluate(async ({ BrowserWindow }, file) => {
    const window = new BrowserWindow({ width: 900, height: 680, show: false, webPreferences: { nodeIntegration: true, contextIsolation: false } });
    await window.loadFile(file);
    return window.id;
  }, join(root, 'desktop/out/crash.html'));
  const crash = await crashPageReady;
  await crash.waitForSelector('.gt-crash-content');
  await app.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id).webContents.send('error', { type: 'launch', error: { name: 'FixtureError', message: 'Isolated presentation fixture', stack: 'FixtureError: Isolated presentation fixture' } }), crashId);
  await crash.waitForFunction(() => document.body.innerText.includes('Isolated presentation fixture'));
  assert.equal(await crash.locator('.background-graphic-bottom, #crash-app').count(), 0);
  await crash.screenshot({ path: join(output, 'crash-recovery.png') }); report.screenshots.push('crash-recovery.png');
  const longStack = 'Error: kill EPERM\n' + Array.from({ length: 45 }, (_, i) => `    at fixture${i} (app/src/ui/gittogether/${'long-path-'.repeat(12)}codex-commit-message.ts:54:23)`).join('\n');
  await app.evaluate(({ BrowserWindow }, { id, stack }) => BrowserWindow.fromId(id).webContents.send('error', { type: 'generic', error: { name: 'Error', message: 'kill EPERM', stack } }), { id: crashId, stack: longStack });
  await crash.waitForFunction(() => document.querySelector('pre')?.textContent.includes('fixture44'));
  for (const [theme, width, height] of [['light', 900, 680], ['dark', 600, 500], ['light', 420, 420]]) {
    await app.evaluate(({ BrowserWindow }, { id, width, height }) => BrowserWindow.fromId(id).setContentSize(width, height), { id: crashId, width, height });
    await crash.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    await crash.waitForFunction(width => innerWidth === width, width);
    const layout = await crash.evaluate(() => {
      const content = document.querySelector('.gt-crash-content'), pre = document.querySelector('pre'), footer = document.querySelector('.gt-crash-page > .footer');
      const scrolls = [...document.querySelectorAll('.gt-crash-page, .gt-crash-page *')].filter(el => /auto|scroll/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1);
      content.scrollTop = content.scrollHeight;
      return { cardCount: document.querySelectorAll('.gt-crash-card').length, scrolls: scrolls.map(el => el.className), shadow: getComputedStyle(content).boxShadow, radius: getComputedStyle(content).borderRadius, preOverflow: getComputedStyle(pre).overflowY, horizontalOverflow: content.scrollWidth > content.clientWidth + 1, footerBottom: footer.getBoundingClientRect().bottom, footerTop: footer.getBoundingClientRect().top, contentBottom: content.getBoundingClientRect().bottom, viewport: innerHeight, bottomReached: content.scrollTop + content.clientHeight >= content.scrollHeight - 1, finalLine: pre.textContent.includes('fixture44'), version: pre.textContent.includes('Version:') };
    });
    assert.equal(layout.cardCount, 0); assert.deepEqual(layout.scrolls, ['gt-crash-content']); assert.equal(layout.shadow, 'none'); assert.equal(layout.radius, '0px'); assert.equal(layout.preOverflow, 'visible'); assert.equal(layout.horizontalOverflow, false);
    assert.ok(layout.footerBottom <= layout.viewport && layout.footerTop >= layout.contentBottom); assert.equal(layout.bottomReached, true); assert.equal(layout.finalLine, true); assert.equal(layout.version, true);
    const filename = `crash-single-scroll-${theme}-${width}.png`; await crash.screenshot({ path: join(output, filename) }); report.screenshots.push(filename);
    await crash.locator('.gt-crash-content').focus(); await crash.keyboard.press('Home');
    await crash.waitForFunction(() => document.querySelector('.gt-crash-content').scrollTop === 0);
    await crash.getByRole('button', { name: '退出', exact: true }).focus(); assert.equal(await crash.getByRole('button', { name: '退出', exact: true }).evaluate(el => el === document.activeElement), true);
  }
  const quit = app.evaluate(({ ipcMain }) => new Promise(resolve => ipcMain.once('crash-quit', () => resolve(true))));
  await crash.getByRole('button', { name: '退出', exact: true }).click(); assert.equal(await quit, true);
  await app.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id).destroy(), crashId);
  report.checks.push('Crash recovery has no nested card or detail scroller: long stacks wrap in one keyboard-scrollable content region, footer and original quit callback remain usable in light/dark and 900/600/420px windows.');
  assert.deepEqual(errors, []);
  report.ok = true;
} catch (error) {
  report.error = error.stack;
  if (page) report.native = await page.evaluate(() => { const a = window.__gittogetherAdapter, s = a.store.getState(); return { popup: s.currentPopup?.type, allPopups: s.allPopups.map(p => p.type), step: s.selectedState?.state?.multiCommitOperationState?.step?.kind, conflict: s.selectedState?.state?.changesState?.conflictState?.kind, selectedGitDir: s.selectedState?.repository?.gitDir }; }).catch(() => null);
  if (page) { await page.screenshot({ path: join(output, 'failure.png') }).catch(() => {}); report.visible = await page.locator('body').innerText().catch(() => ''); }
  throw error;
} finally {
  report.errors = errors; writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2));
  writeFileSync(join(output, 'review.html'), '<!doctype html><html lang="zh"><meta charset="utf-8"><title>GitTogether Material 界面核对</title><style>body{font:14px system-ui;background:#f6f5fa;color:#1b1b20;margin:24px}h1{font-size:24px}section{margin:24px 0}img{display:block;width:min(100%,1100px);border:1px solid #e1dfe7;border-radius:16px}p{max-width:900px}</style><h1>GitTogether Material 界面核对</h1><p>隔离原生运行截图。所有操作仅使用临时测试仓库；没有代用户登录或更新安装版。完整结果见 report.json。</p>' + report.screenshots.map(file => `<section><h2>${file.replace('.png', '')}</h2><img src="${file}" alt="${file}"></section>`).join('') + '</html>');
  await app.close();
}
console.log(JSON.stringify(report, null, 2));
