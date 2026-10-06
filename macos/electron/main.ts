import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, screen, shell, type IpcMainInvokeEvent } from 'electron';
import { join } from 'node:path';
import liquidGlass from 'electron-liquid-glass';
import { AccountService } from '../server/account-service';
import { encryptedStore } from './credential-store';
import { githubVerificationURL } from '../src/import-model';
import { isTrustedRendererURL, type RendererSource } from './renderer-source';
import { systemFetch } from './system-network';

let window: BrowserWindow | null = null;
let nativeGlass = false;
let resolveGlass: () => void;
let glassReady: Promise<void>;
let accountService: AccountService;
app.setName('GitTogether');
app.setPath('userData', join(app.getPath('appData'), 'GitTogether-Standalone-Demo'));
const rendererSource: RendererSource = app.isPackaged
  ? { kind: 'file', path: join(app.getAppPath(), 'client', 'index.html') }
  : { kind: 'url', url: process.env.GITTOGETHER_PREVIEW_URL || 'http://127.0.0.1:4173/' };

function isMainRenderer(event: IpcMainInvokeEvent): boolean {
  return !!window && event.sender === window.webContents && !!event.senderFrame
    && event.senderFrame === window.webContents.mainFrame
    && isTrustedRendererURL(event.senderFrame.url, rendererSource);
}

function createWindow() {
  nativeGlass = false;
  let initialized = false;
  glassReady = new Promise<void>(resolve => { resolveGlass = resolve; });
  const display = screen.getPrimaryDisplay().workAreaSize;
  const width = Math.min(1600, display.width - 80);
  window = new BrowserWindow({
    title: 'GitTogether',
    width, height: Math.min(1000, display.height - 60),
    minWidth: 920, minHeight: 640,
    transparent: true, backgroundColor: '#00000000', titleBarStyle: 'hidden',
    trafficLightPosition: { x: 20, y: 18 }, show: false,
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  window.setWindowButtonVisibility(true);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('console-message', details => { if (details.level === 'error') console.error('Renderer:', details.message); });
  window.webContents.on('will-navigate', (event, url) => { if (!isTrustedRendererURL(url, rendererSource)) event.preventDefault(); });
  window.webContents.on('did-finish-load', () => {
    if (initialized) return;
    try {
      nativeGlass = liquidGlass.isGlassSupported() && liquidGlass.addView(window!.getNativeWindowHandle(), { cornerRadius: 18 }) >= 0;
      console.log(`GitTogether native Liquid Glass: ${nativeGlass ? 'enabled' : 'fallback'}`);
    } catch (error) { nativeGlass = false; console.warn('Native glass unavailable:', error instanceof Error ? error.message : error); }
    initialized = true; resolveGlass(); window!.show();
  });
  window.on('closed', () => { window = null; });
  if (rendererSource.kind === 'file') void window.loadFile(rendererSource.path);
  else void window.loadURL(rendererSource.url);
}

ipcMain.handle('gittogether:environment', async event => {
  if (!isMainRenderer(event)) throw new Error('Unknown sender');
  await glassReady;
  console.log('GitTogether renderer mounted; native bridge connected.');
  return { nativeGlass, platform: process.platform };
});
ipcMain.handle('gittogether:theme', (event, theme: unknown) => {
  if (!isMainRenderer(event)) throw new Error('Unknown sender');
  if (theme === 'light' || theme === 'dark' || theme === 'system') nativeTheme.themeSource = theme;
});
ipcMain.handle('gittogether:import', async (event, method: unknown, input: unknown) => {
  if (!isMainRenderer(event)) return { ok: false, error: '无效的应用来源。' };
  try { return { ok: true, value: await accountService.handle(method, input) }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : '账号服务失败。' }; }
});
ipcMain.handle('gittogether:choose-directory', async event => {
  if (!isMainRenderer(event)) throw new Error('Unknown sender');
  const result = await dialog.showOpenDialog(window!, { title: '选择已有的本地 Git 仓库', properties: ['openDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('gittogether:github-authorization', async event => {
  if (!isMainRenderer(event)) throw new Error('Unknown sender');
  // This bridge cannot open caller-supplied URLs or embed GitHub credentials.
  await shell.openExternal(githubVerificationURL);
});
app.whenReady().then(() => {
  accountService = new AccountService(encryptedStore(join(app.getPath('userData'), 'accounts-v2.encrypted')), systemFetch);
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'GitTogether', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'front' }] },
  ]));
  createWindow();
  app.on('activate', () => { if (!window) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
