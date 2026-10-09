import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, screen, shell, type IpcMainInvokeEvent } from 'electron';
import { join } from 'node:path';
import { AccountService } from '../server/account-service';
import { encryptedStore } from './credential-store';
import { githubVerificationURL } from '../src/import-model';
import { isTrustedRendererURL, type RendererSource } from './renderer-source';
import { systemFetch } from './system-network';
import { MacUpdater } from 'electron-updater';
import { AppUpdater } from './app-updater';
import { updateSource } from '../src/update-model';
import { isRecord } from '../src/import-model';
import { NativeGitHubAuthorization } from './native-github-authorization';
import { nativeOAuthHelper, runNativeOAuthHelper } from './native-oauth-helper';
import { createLoopbackFetch } from './system-network';

let window: BrowserWindow | null = null;
let accountService: AccountService;
let updater: AppUpdater;
let activeImports = 0;
let nativeGithub: NativeGitHubAuthorization;
const authorizationHelper = nativeOAuthHelper();
const helperMode = process.argv.includes('--gittogether-authorization-helper');
app.setName(helperMode ? 'GitTogether Authorization' : 'GitTogether');
if (helperMode) {
  const directory = process.argv.find(value => value.startsWith('--gittogether-helper-session='))?.split('=').slice(1).join('=');
  if (!directory) throw new Error('授权助手缺少独立会话目录。');
  app.setPath('userData', directory); app.setPath('sessionData', directory);
} else app.setPath('userData', join(app.getPath('appData'), 'GitTogether-Standalone-Demo'));
const rendererSource: RendererSource = app.isPackaged
  ? { kind: 'file', path: join(app.getAppPath(), 'client', 'index.html') }
  : { kind: 'url', url: process.env.GITTOGETHER_PREVIEW_URL || 'http://127.0.0.1:4173/' };

function isMainRenderer(event: IpcMainInvokeEvent): boolean {
  return !!window && event.sender === window.webContents && !!event.senderFrame
    && event.senderFrame === window.webContents.mainFrame
    && isTrustedRendererURL(event.senderFrame.url, rendererSource);
}

function createWindow() {
  const display = screen.getPrimaryDisplay().workAreaSize;
  const width = Math.min(1600, display.width - 80);
  window = new BrowserWindow({
    title: 'GitTogether',
    width, height: Math.min(1000, display.height - 60),
    minWidth: 920, minHeight: 640,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#131318' : '#f6f5fa', titleBarStyle: 'hidden',
    trafficLightPosition: { x: 20, y: 18 }, show: false,
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  window.setWindowButtonVisibility(true);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('console-message', details => { if (details.level === 'error') console.error('Renderer:', details.message); });
  window.webContents.on('will-navigate', (event, url) => { if (!isTrustedRendererURL(url, rendererSource)) event.preventDefault(); });
  window.once('ready-to-show', () => window!.show());
  window.on('closed', () => { window = null; });
  if (rendererSource.kind === 'file') void window.loadFile(rendererSource.path);
  else void window.loadURL(rendererSource.url);
}

ipcMain.handle('gittogether:environment', async event => {
  if (!isMainRenderer(event)) throw new Error('Unknown sender');
  console.log('GitTogether renderer mounted; native bridge connected.');
  // Keep the finite bridge response compatible with already-built renderers.
  return { nativeGlass: false, platform: process.platform };
});
nativeTheme.on('updated', () => window?.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#131318' : '#f6f5fa'));
ipcMain.handle('gittogether:theme', (event, theme: unknown) => {
  if (!isMainRenderer(event)) throw new Error('Unknown sender');
  if (theme === 'light' || theme === 'dark' || theme === 'system') nativeTheme.themeSource = theme;
});
ipcMain.handle('gittogether:import', async (event, method: unknown, input: unknown) => {
  if (!isMainRenderer(event)) return { ok: false, error: '无效的应用来源。' };
  if (updater.status().phase === 'installing') return { ok: false, error: '正在安装应用更新，请重启后继续。' };
  activeImports++;
  try { return { ok: true, value: await accountService.handle(method, input) }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : '账号服务失败。' }; }
  finally { activeImports--; }
});
ipcMain.handle('gittogether:choose-directory', async event => {
  if (!isMainRenderer(event)) throw new Error('Unknown sender');
  const result = await dialog.showOpenDialog(window!, { title: '选择本地仓库或其父文件夹', properties: ['openDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('gittogether:github-authorization', async event => {
  if (!isMainRenderer(event)) throw new Error('Unknown sender');
  // This bridge cannot open caller-supplied URLs or embed GitHub credentials.
  await shell.openExternal(githubVerificationURL);
});
ipcMain.handle('gittogether:github-web', async (event, method: unknown, input: unknown) => {
  if (!isMainRenderer(event)) return { ok: false, error: '无效的应用来源。' };
  if (!isRecord(input)) return { ok: false, error: '授权请求无效。' };
  activeImports++;
  try {
    if (updater.status().phase === 'installing') throw new Error('正在安装应用更新，请重启后继续。');
    let value: unknown;
    if (method === 'start') {
      if (typeof input.name !== 'string' || input.name.length > 120) throw new Error('账号名称无效。');
      value = await nativeGithub.start(input.name);
    } else {
      if (typeof input.sessionId !== 'string' || !/^[\w-]{36}$/.test(input.sessionId)) throw new Error('授权会话无效。');
      if (method === 'poll') { value = await nativeGithub.poll(input.sessionId); if (isRecord(value) && value.status === 'complete') { window?.show(); window?.focus(); } }
      else if (method === 'cancel') value = await nativeGithub.cancel(input.sessionId);
      else if (method === 'open') { await shell.openExternal(nativeGithub.authorizationURL(input.sessionId)); value = true; }
      else throw new Error('不支持该授权操作。');
    }
    return { ok: true, value };
  } catch (problem) { return { ok: false, error: problem instanceof Error ? problem.message : 'GitHub 授权失败。' }; }
  finally { activeImports--; }
});
app.whenReady().then(async () => {
  if (helperMode) { await runNativeOAuthHelper(); return; }
  const engine = app.isPackaged && process.platform === 'darwin' ? new MacUpdater(updateSource) : null;
  if (engine) engine.logger = null;
  updater = new AppUpdater(engine, app.getVersion(), () => activeImports === 0 && !nativeGithub?.busy);
  accountService = new AccountService(encryptedStore(join(app.getPath('userData'), 'accounts-v2.encrypted')), systemFetch, { openFile: async target => {
    if (target.source === 'remote') await shell.openExternal(target.value);
    else if (await shell.openPath(target.value)) throw new Error('无法用系统默认应用打开此文件，请检查是否有可用应用。');
  } });
  nativeGithub = new NativeGitHubAuthorization(credential => accountService.connectGitHubWebAuthorization(credential), await createLoopbackFetch(), authorizationHelper.ensure);
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'GitTogether', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'front' }] },
  ]));
  createWindow();
  app.on('activate', () => { if (!window) createWindow(); });
}).catch(() => { console.error('GitTogether 启动失败，请检查系统钥匙串和本机授权服务。'); app.exit(1); });
app.on('before-quit', () => { if (!helperMode) { nativeGithub?.close(); authorizationHelper.close(); } });
ipcMain.handle('gittogether:update-status', event => {
  if (!isMainRenderer(event)) throw new Error('Unknown sender');
  return updater.status();
});
ipcMain.handle('gittogether:update-check', event => {
  if (!isMainRenderer(event)) throw new Error('Unknown sender');
  return updater.check();
});
ipcMain.handle('gittogether:update-download', event => {
  if (!isMainRenderer(event)) throw new Error('Unknown sender');
  return updater.download();
});
ipcMain.handle('gittogether:update-install', event => {
  if (!isMainRenderer(event)) throw new Error('Unknown sender');
  return updater.install();
});
app.on('window-all-closed', () => { if (!helperMode && process.platform !== 'darwin') app.quit(); });
