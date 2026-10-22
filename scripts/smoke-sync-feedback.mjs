import { sourceState } from './source-state.mjs';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, realpathSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..'), appRoot = join(root, 'desktop/out');
const build = JSON.parse(readFileSync(join(appRoot, 'build-info.json'), 'utf8'));
assert.equal(build.sourceSha256, sourceState(root), 'Rebuild changed sources before running the isolated sync check.');
const require = createRequire(join(root, 'desktop/package.json')), { _electron } = require('playwright');
const fixture = realpathSync(mkdtempSync(join(tmpdir(), 'gittogether-sync-smoke-')));
const bare = join(fixture, 'remote.git'), producer = join(fixture, 'producer'), work = join(fixture, 'work');
const output = join(root, 'artifacts/sync-feedback', build.version); mkdirSync(output, { recursive: true });
const env = { ...process.env, GIT_CONFIG_GLOBAL: join(fixture, 'gitconfig'), GIT_CONFIG_NOSYSTEM: '1', GITTOGETHER_SMOKE: '1', NODE_ENV: 'development' };
const git = (args, cwd = fixture) => execFileSync(join(appRoot, 'git/bin/git'), args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
git(['config', '--global', 'user.name', 'Sync Fixture']); git(['config', '--global', 'user.email', 'sync@example.invalid']); git(['config', '--global', 'commit.gpgsign', 'false']);
git(['init', '--bare', '--initial-branch=main', bare]); git(['clone', pathToFileURL(bare).href, producer]);
writeFileSync(join(producer, 'readme.txt'), 'initial\n'); git(['add', '.'], producer); git(['commit', '-m', 'initial'], producer); git(['push', '-u', 'origin', 'main'], producer);
git(['clone', pathToFileURL(bare).href, work]); git(['remote', 'rename', 'origin', 'enterprise'], work); git(['branch', '-m', 'local-main'], work); git(['branch', '--set-upstream-to=enterprise/main'], work);
const initialHead = git(['rev-parse', 'HEAD'], work);
writeFileSync(join(work, 'local-only.txt'), 'keep staged content\n'); git(['add', 'local-only.txt'], work);
const staged = git(['diff', '--cached', '--binary'], work), index = readFileSync(join(work, '.git/index'));
for (let n = 1; n <= 2; n++) { writeFileSync(join(producer, 'readme.txt'), `remote ${n}\n`); git(['add', '.'], producer); git(['commit', '-m', `remote ${n}`], producer); }
git(['push'], producer); const remoteHead = git(['rev-parse', 'HEAD'], producer);
const hookMarker = join(fixture, 'post-merge-entered');
mkdirSync(join(work, '.git/hooks'), { recursive: true });
writeFileSync(join(work, '.git/hooks/post-merge'), '#!/bin/sh\nprintf started > ' + "'" + hookMarker.replaceAll("'", "'\\''") + "'" + '\nsleep 5\n'); chmodSync(join(work, '.git/hooks/post-merge'), 0o755);

const app = await _electron.launch({ executablePath: join(root, 'desktop/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), args: ['--allow-file-access-from-files', '--user-data-dir=' + join(fixture, 'profile'), appRoot], cwd: fixture, env, timeout: 60_000 });
const report = { ok: false, version: build.version, sourceSha256: build.sourceSha256, fixture, checks: [], screenshots: [] };
const errors = [];
let page;
try {
  page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message));
  await page.waitForFunction(() => window.__gittogetherAdapter, { timeout: 30_000 });
  const call = (method, input) => page.evaluate(({ method, input }) => window.__gittogetherAdapter.handle(method, input), { method, input });
  await call('link', { repositoryId: '', path: work });
  await page.evaluate(async () => { const a = window.__gittogetherAdapter; a.dispatcher.closePopup(); const foldout = a.store.getState().currentFoldout; if (foldout) await a.dispatcher.closeFoldout(foldout.type); });
  const catalog = await call('catalog', {}), link = catalog.links.find(item => item.path === work); assert.ok(link);
  const frame = page.frameLocator('#gittogether-ui');
  // No explicit Fetch/Push/Pull: the existing UI freshness request must fetch
  // the unsupported platform after the imported directory appears.
  const repositoryRow = frame.locator('.dashboard-repository-row').filter({ has: frame.locator('.repository-link').filter({ hasText: 'work' }) });
  await repositoryRow.locator('.git-action-group[aria-label="远端内容"] .git-action-badge').filter({ hasText: /^2$/ }).waitFor({ timeout: 45_000 });
  assert.equal(git(['rev-parse', 'refs/remotes/enterprise/main'], work), remoteHead);
  assert.equal(git(['rev-parse', 'HEAD'], work), initialHead);
  assert.equal(git(['diff', '--cached', '--binary'], work), staged);
  assert.deepEqual(readFileSync(join(work, '.git/index')), index);
  assert.equal(readFileSync(join(work, 'readme.txt'), 'utf8'), 'initial\n');
  assert.equal(readFileSync(join(work, 'local-only.txt'), 'utf8'), 'keep staged content\n');
  report.checks.push('automatic native Fetch without Push/Pull, with HEAD/index/staged and working files preserved');

  await frame.locator('.repository-link').filter({ hasText: 'work' }).click();
  await frame.locator('.repository-workspace-view').waitFor({ timeout: 25_000 });
  const pullGroup = frame.locator('.repository-overview-actions .git-action-group[aria-label="远端内容"]');
  await pullGroup.locator('.git-action-badge').filter({ hasText: /^2$/ }).waitFor({ timeout: 25_000 });
  const workspace = await call('localWorkspace', { repositoryId: link.repositoryId }), task = workspace.tasks[0];
  assert.equal(task.branch, 'local-main'); assert.deepEqual(task.tracking, { upstream: 'enterprise/main', ahead: 0, behind: 2 });
  report.checks.push('Pull badge shows two actual upstream commits despite different local/remote branch names');
  await page.screenshot({ path: join(output, 'pull-badge.png') }); report.screenshots.push('pull-badge.png');

  await page.evaluate(() => {
    const a = window.__gittogetherAdapter; window.__syncProgressEvents = []; window.__pullCalls = 0;
    window.addEventListener('gittogether:sync-progress', event => window.__syncProgressEvents.push(event.detail));
    const original = a.dispatcher.pull.bind(a.dispatcher);
    a.dispatcher.pull = async repository => { window.__pullCalls++; return original(repository); };
  });
  await pullGroup.getByRole('button', { name: /^Pull：/ }).click();
  await frame.getByRole('button', { name: '确认 Pull', exact: true }).click();
  await frame.locator('.repository-sync-progress').waitFor({ timeout: 15_000 });
  await page.waitForFunction(() => window.__syncProgressEvents.some(event => event.title === '拉取并整合更新'), { timeout: 15_000 });
  await frame.getByRole('button', { name: /^收起 Pull/ }).click();
  await pullGroup.getByRole('button', { name: /^Pull：/ }).click();
  await frame.locator('.repository-sync-progress').waitFor();
  await frame.locator('.repository-sync-progress').evaluate(async element => {
    const surface = element.closest('.ogui-overlay__surface');
    await Promise.all((surface?.getAnimations({ subtree: true }) || []).filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime)).map(animation => animation.finished.catch(() => {})));
  });
  await frame.locator('.repository-sync-progress').getByText(/已用 [1-9]\d* 秒/).waitFor({ timeout: 5_000 });
  await page.screenshot({ path: join(output, 'pull-running-restored.png') }); report.screenshots.push('pull-running-restored.png');
  await frame.locator('.repository-sync-dialog').getByText(/Pull 已完成/).waitFor({ timeout: 30_000 });
  assert.equal(git(['rev-parse', 'HEAD'], work), remoteHead); assert.equal(git(['diff', '--cached', '--binary'], work), staged);
  assert.equal(readFileSync(join(work, 'local-only.txt'), 'utf8'), 'keep staged content\n');
  const progress = await page.evaluate(() => ({ calls: window.__pullCalls, events: window.__syncProgressEvents }));
  assert.equal(progress.calls, 1); assert.ok(progress.events.some(event => event.state === 'completed'));
  assert.ok(progress.events.some(event => event.state === 'running' && event.value === null));
  report.checks.push('actual original Pull progress crosses private bridge, survives collapse/restore and executes exactly once');
  report.progress = progress.events;
  await frame.getByRole('button', { name: '关闭', exact: true }).click();
  assert.equal((await call('localWorkspace', { repositoryId: link.repositoryId })).tasks[0].tracking.behind, 0);
  await pullGroup.locator('.git-action-badge').waitFor({ state: 'hidden', timeout: 15_000 });
  report.checks.push('successful Pull refreshes actual counts and removes the badge');

  for (let n = 0; n < 130; n++) git(['commit', '--allow-empty', '-m', `long history ${n}`], producer);
  git(['push'], producer);
  await page.evaluate(async repositoryId => { const a = window.__gittogetherAdapter, r = await a.repository(repositoryId); await a.dispatcher.fetch(r, 1); }, link.repositoryId);
  const longLocal = await call('localWorkspace', { repositoryId: link.repositoryId }), longRemote = await call('remoteWorkspace', { repositoryId: link.repositoryId });
  assert.equal(longLocal.tasks[0].tracking.behind, 130); assert.ok(longRemote.commits.length <= 100);
  report.checks.push('native behind=130 remains accurate when remote graph is capped at 100 commits');
  const failedPlan = await call('prepareSync', { repositoryId: link.repositoryId, taskId: task.id, mode: 'pull' });
  renameSync(bare, join(fixture, 'offline-remote.git'));
  const failedId = crypto.randomUUID();
  await assert.rejects(call('applySync', { repositoryId: link.repositoryId, taskId: task.id, planId: failedPlan.id, operationId: failedId }), /未确认 Pull 完成|冲突|错误/);
  const failureProgress = await page.evaluate(operationId => window.__syncProgressEvents.filter(event => event.operationId === operationId), failedId);
  assert.equal(failureProgress.at(-1).state, 'failed'); assert.equal(failureProgress.at(-1).value, null);
  assert.ok(!failureProgress.some(event => event.state === 'completed'));
  assert.equal(git(['rev-parse', 'HEAD'], work), remoteHead); assert.equal(git(['diff', '--cached', '--binary'], work), staged);
  report.checks.push('offline Pull reports failure without 100% completion and preserves local commits and staged files');
  report.failureProgress = failureProgress;
  assert.deepEqual(errors, []); report.ok = true;
  writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, report: join(output, 'report.json'), checks: report.checks }, null, 2));
} catch (error) {
  report.error = error.stack || String(error); report.pageErrors = errors;
  if (page) { await page.screenshot({ path: join(output, 'failure.png') }).catch(() => {}); report.state = await page.evaluate(() => ({ text: document.body.innerText, frame: document.querySelector('#gittogether-ui')?.contentDocument?.body.innerText, popups: window.__gittogetherAdapter?.store.getState().allPopups.map(popup => ({ type: popup.type, message: popup.error?.message })) })).catch(() => null); }
  writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2)); throw error;
} finally { await app.close(); }
