import { app, BrowserWindow, ipcMain, Menu, nativeTheme, screen } from 'electron';
import { join } from 'node:path';
import liquidGlass from 'electron-liquid-glass';

let window: BrowserWindow | null = null;
let nativeGlass = false;
let resolveGlass: () => void;
let glassReady: Promise<void>;
app.setName('GitTogether');
app.setPath('userData', join(app.getPath('appData'), 'GitTogether-Standalone-Demo'));
const previewURL = process.env.GITTOGETHER_PREVIEW_URL || 'http://127.0.0.1:4173/';
const allowedOrigin = new URL(previewURL).origin;

function createWindow() {
  nativeGlass = false;
  let initialized = false;
  glassReady = new Promise<void>(resolve => { resolveGlass = resolve; });
  const display = screen.getPrimaryDisplay().workAreaSize;
  window = new BrowserWindow({
    title: 'GitTogether · Independent TypeScript · Demo',
    width: Math.min(1600, display.width - 80), height: Math.min(1000, display.height - 60),
    minWidth: 920, minHeight: 640,
    transparent: true, backgroundColor: '#00000000', titleBarStyle: 'hidden',
    trafficLightPosition: { x: 20, y: 21 }, show: false,
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  window.setWindowButtonVisibility(true);
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
app.whenReady().then(() => {
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
