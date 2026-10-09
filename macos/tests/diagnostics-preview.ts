// Production-built UI + real preload/diagnostic command, with synthetic provider
// credentials, disposable profile/logs and an injected opener (no user state).
import { app, BrowserWindow, ipcMain } from 'electron';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, readdir, rm, writeFile, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { LocalDiagnostics } from '../server/diagnostics';
import { diagnosticsCommand } from '../server/diagnostics-command';
import { diagnosticsMiddleware } from '../server/diagnostics-http';
import { importMiddleware } from '../server/http-api';
import { createRemoteServiceFixture } from './remote-service-fixture';

async function run() {
  const evidence = resolve(dirname(process.argv[1]));
  const profile = await mkdtemp(join(tmpdir(), 'gittogether-diagnostics-profile-'));
  app.setPath('userData', profile); app.setPath('sessionData', profile);
  await app.whenReady(); app.dock?.hide();
  app.removeAllListeners('window-all-closed'); app.on('window-all-closed', () => {});
  const logs = new LocalDiagnostics(join(profile, 'logs'), 'test');
  const fixture = await createRemoteServiceFixture('gitea', { diagnostics: logs });
  const root = resolve('dist/client'); const opened: string[] = []; const errors: string[] = [];
  const open = async (directory: string) => { opened.push(directory); };
  const imports = importMiddleware(fixture.service); const diagnosticHTTP = diagnosticsMiddleware(logs, open);
  const server = createServer((request, response) => { void diagnosticHTTP(request, response, () => { void imports(request, response, () => { void (async () => {
    const path = resolve(root, `.${decodeURIComponent(request.url === '/' ? '/index.html' : request.url || '/')}`);
    if (!path.startsWith(`${root}${sep}`)) { response.statusCode = 403; response.end(); return; }
    response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' } as Record<string, string>)[extname(path)] || 'application/octet-stream');
    response.end(await readFile(path));
  })().catch(() => { response.statusCode = 404; response.end(); }); }); }); });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  const windows: BrowserWindow[] = []; const allowed = (event: Electron.IpcMainInvokeEvent) => windows.some(window => !window.isDestroyed() && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && event.senderFrame.url === `${origin}/`);
  ipcMain.handle('gittogether:environment', () => ({ nativeGlass: false, platform: 'darwin' }));
  ipcMain.handle('gittogether:theme', () => {});
  ipcMain.handle('gittogether:update-status', () => ({ phase: 'unavailable', currentVersion: '0.13.0' }));
  ipcMain.handle('gittogether:import', async (event, method, input, requestId) => { assert.ok(allowed(event)); try { return { ok: true, value: await fixture.service.handle(method, input, undefined, requestId) }; } catch (problem) { return { ok: false, error: problem instanceof Error ? problem.message : '操作失败。' }; } });
  ipcMain.handle('gittogether:diagnostics', (event, method, input) => { assert.ok(allowed(event)); return diagnosticsCommand(logs, method, input, open); });
  const rows = async () => (await Promise.all((await readdir(logs.directory)).filter(name => name.endsWith('.jsonl')).map(name => readFile(join(logs.directory, name), 'utf8')))).flatMap(text => text.trim().split('\n').filter(Boolean).map(row => JSON.parse(row)));
  async function wait(window: BrowserWindow, condition: string) {
    const until = Date.now() + 10_000;
    while (Date.now() < until) { if (await window.webContents.executeJavaScript(condition)) return; await new Promise(done => setTimeout(done, 50)); }
    throw new Error(`Diagnostic UI condition timed out: ${condition}`);
  }
  try {
    for (const native of [false, true]) {
      const window = new BrowserWindow({ show: false, width: 1300, height: 1000, webPreferences: { ...(native ? { preload: join(evidence, 'preload.cjs') } : {}), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } }); windows.push(window);
      window.webContents.on('console-message', details => { if (details.level === 'error') errors.push(details.message); });
      await window.loadURL(`${origin}/`);
      assert.equal(await window.webContents.executeJavaScript(`!!window.gittogether?.diagnostics`), native, 'native scenario must use actual sandbox preload, not HTTP fallback');
      await wait(window, `document.querySelectorAll('.repository-actions').length > 0`);
      const count = (await rows()).length;
      await window.webContents.executeJavaScript(`document.querySelector('.git-action-anchor').click(); window.dispatchEvent(new ErrorEvent('error', {error: new TypeError('SENSITIVE_PAYLOAD_NEVER_LOG'), message:'SENSITIVE_PAYLOAD_NEVER_LOG'})); window.dispatchEvent(new Event('offline')); window.dispatchEvent(new Event('online')); [...document.querySelectorAll('button')].find(el=>el.getAttribute('aria-label')==='设置').click();`);
      await wait(window, `!!document.querySelector('#diagnostics-settings-title') && [...document.querySelectorAll('button')].some(el=>el.textContent==='打开日志目录' && !el.disabled)`);
      await window.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(el=>el.textContent==='打开日志目录').click()`);
      for (let i = 0; opened.length < (native ? 2 : 1) && i < 100; i++) await new Promise(done => setTimeout(done, 20));
      assert.equal(opened.at(-1), logs.directory); assert.equal(opened.length, native ? 2 : 1);
      await wait(window, `[...document.querySelectorAll('button')].some(el=>el.textContent==='打开日志目录' && !el.disabled)`);
      const after = await rows(); assert.ok(after.length > count); assert.ok(after.some(row => row.event === 'renderer' && row.errorKind === 'TypeError'));
      assert.ok(after.some(row => row.event === 'ui-action' && row.method === 'commit' && row.outcome === 'blocked'));
      assert.ok(!JSON.stringify(after).includes('SENSITIVE_PAYLOAD_NEVER_LOG')); assert.ok(!JSON.stringify(after).includes('fixture-remote-old'));
      await writeFile(join(evidence, native ? 'settings-native.png' : 'settings-browser.png'), (await window.webContents.capturePage()).toPNG());
      if (native) {
        const kept = join(profile, 'logs-kept'); await rename(logs.directory, kept); await writeFile(logs.directory, 'isolated logging failure');
        await window.loadURL(`${origin}/`);
        await wait(window, `!!document.querySelector('[aria-label="设置"]')`);
        await window.webContents.executeJavaScript(`document.querySelector('[aria-label="设置"]').click()`);
        await wait(window, `document.querySelector('.settings-view')?.textContent.includes('日志写入失败') && [...document.querySelectorAll('button')].some(el=>el.textContent==='打开日志目录' && el.disabled)`);
        await writeFile(join(evidence, 'logging-unavailable-native.png'), (await window.webContents.capturePage()).toPNG());
        await rm(logs.directory); await rename(kept, logs.directory); logs.record({ event: 'lifecycle', outcome: 'resumed' });
        await window.loadURL(`${origin}/`); await wait(window, `!!document.querySelector('[aria-label="设置"]')`);
        await window.webContents.executeJavaScript(`document.querySelector('[aria-label="设置"]').click()`);
        await wait(window, `!document.querySelector('.settings-view')?.textContent.includes('日志写入失败') && [...document.querySelectorAll('button')].some(el=>el.textContent==='打开日志目录' && !el.disabled)`);
      }
      window.destroy();
    }
    assert.deepEqual(errors, []); assert.ok(await fixture.unchanged());
    const result = { productionUI: true, productionPreload: true, productionDiagnosticCommand: true, disposableProfile: true, browserAndNative: true, nativeWriteFailureRecovery: true, directoryOpeners: opened.length, consoleErrors: errors.length, gitUnchanged: true, privacyPassed: true, recordCount: (await rows()).length };
    await writeFile(join(evidence, 'result.json'), JSON.stringify(result)); console.log(JSON.stringify(result));
  } finally { for (const window of windows) if (!window.isDestroyed()) window.destroy(); logs.close(); server.closeAllConnections(); server.close(); await fixture.cleanup(); await rm(profile, { recursive: true, force: true }); }
}
run().then(() => app.quit()).catch(problem => { console.error(problem); app.exit(1); });
