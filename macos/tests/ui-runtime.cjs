// Disposable renderer QA for this app, separate from installed app user data.
const { app, BrowserWindow } = require('electron');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { createInterface } = require('node:readline');
const directory = mkdtempSync(join(tmpdir(), 'gittogether-renderer-'));
app.setPath('userData', directory); app.setName('GitTogether QA');
let window;
app.whenReady().then(async () => {
  window = new BrowserWindow({ show: false, width: 1440, height: 1000, webPreferences: { backgroundThrottling: false, contextIsolation: true, sandbox: true } });
  window.webContents.on('console-message', (_event, level, message) => { if (level >= 3) process.stdout.write(JSON.stringify({ rendererError: message }) + '\n'); });
  await window.loadURL(process.argv[2]);
  process.stdout.write(JSON.stringify({ ready: true, isolatedRenderer: true }) + '\n');
  const terminal = createInterface({ input: process.stdin }); let work = Promise.resolve();
  terminal.on('line', line => { work = work.then(async () => {
    const request = JSON.parse(line);
    if (Array.isArray(request.size) && request.size.length === 2 && request.size.every(value => Number.isInteger(value) && value >= 500 && value <= 2000)) window.setSize(...request.size);
    if (request.evaluate) process.stdout.write(JSON.stringify({ id: request.id, value: await window.webContents.executeJavaScript(request.evaluate, true) }) + '\n');
    if (request.screenshot) { writeFileSync(request.screenshot, (await window.webContents.capturePage()).toPNG()); process.stdout.write(JSON.stringify({ screenshot: request.screenshot }) + '\n'); }
    if (request.quit) { terminal.close(); window.destroy(); app.quit(); }
  }).catch(problem => { process.stdout.write(JSON.stringify({ error: problem.message }) + '\n'); }); });
});
app.on('will-quit', () => rmSync(directory, { recursive: true, force: true }));
process.on('SIGTERM', () => app.quit());
process.on('SIGINT', () => app.quit());
