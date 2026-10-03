import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, screen } from 'electron';
import { join } from 'node:path';
import liquidGlass from 'electron-liquid-glass';
import { AccountService } from '../server/account-service';
import { encryptedStore } from './credential-store';

let window: BrowserWindow | null = null;
let nativeGlass = false;
let resolveGlass: () => void;
let glassReady: Promise<void>;
let accountService: AccountService;
app.setName('GitTogether');
app.setPath('userData', join(app.getPath('appData'), 'GitTogether-Standalone-Demo'));
const previewURL = process.env.GITTOGETHER_PREVIEW_URL || 'http://127.0.0.1:4173/';
const allowedOrigin = new URL(previewURL).origin;

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
    trafficLightPosition: { x: width <= 1150 ? 15 : 29, y: 32 }, show: false,
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  window.setWindowButtonVisibility(true);
  window.on('resize', () => {
    if (process.platform === 'darwin') window?.setWindowButtonPosition({ x: window.getContentSize()[0] <= 1150 ? 15 : 29, y: 32 });
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('console-message', details => { if (details.level === 'error') console.error('Renderer:', details.message); });
  window.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== allowedOrigin) event.preventDefault(); });
  window.webContents.on('did-finish-load', () => {
    if (initialized) return;
    try {
      nativeGlass = liquidGlass.isGlassSupported() && liquidGlass.addView(window!.getNativeWindowHandle(), { cornerRadius: 18 }) >= 0;
      console.log(`GitTogether native Liquid Glass: ${nativeGlass ? 'enabled' : 'fallback'}`);
    } catch (error) { nativeGlass = false; console.warn('Native glass unavailable:', error instanceof Error ? error.message : error); }
    initialized = true; resolveGlass(); window!.show();
  });
  window.on('closed', () => { window = null; });
  void window.loadURL(previewURL);
}

ipcMain.handle('gittogether:environment', async event => {
  if (event.sender !== window?.webContents) throw new Error('Unknown sender');
  await glassReady;
  console.log('GitTogether renderer mounted; native bridge connected.');
  return { nativeGlass, platform: process.platform };
});
ipcMain.handle('gittogether:theme', (event, theme: unknown) => {
  if (event.sender !== window?.webContents) throw new Error('Unknown sender');
  if (theme === 'light' || theme === 'dark' || theme === 'system') nativeTheme.themeSource = theme;
});
ipcMain.handle('gittogether:import', async (event, method: unknown, input: unknown) => {
  if (event.sender !== window?.webContents || !event.senderFrame || new URL(event.senderFrame.url).origin !== allowedOrigin || event.senderFrame !== window.webContents.mainFrame) return { ok: false, error: '无效的应用来源。' };
  try { return { ok: true, value: await accountService.handle(method, input) }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : '账号服务失败。' }; }
});
ipcMain.handle('gittogether:choose-directory', async event => {
  if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Unknown sender');
  const result = await dialog.showOpenDialog(window, { title: '选择已有的本地 Git 仓库', properties: ['openDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});
app.whenReady().then(() => {
  accountService = new AccountService(encryptedStore(join(app.getPath('userData'), 'accounts-v2.encrypted')));
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
