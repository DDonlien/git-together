import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { isTrustedRendererURL, type RendererSource } from '../electron/renderer-source';

const packaged: RendererSource = { kind: 'file', path: '/Applications/Git Together.app/Contents/Resources/app/client/index.html' };

test('packaged renderer trusts its exact page and fragment, not all opaque file origins', () => {
  const url = pathToFileURL(packaged.path).href;
  assert.equal(isTrustedRendererURL(url, packaged), true);
  assert.equal(isTrustedRendererURL(`${url}#settings`, packaged), true);
  for (const invalid of ['file:///tmp/index.html', 'file:///Applications/Git%20Together.app/Contents/Resources/app/client/assets/index.html', 'file://remote-host/Applications/Git%20Together.app/Contents/Resources/app/client/index.html', 'http://127.0.0.1:4173/', 'https://github.com/', 'null', 'not a URL']) {
    assert.equal(isTrustedRendererURL(invalid, packaged), false, invalid);
  }
});

test('development renderer retains the exact preview origin restriction', () => {
  const source: RendererSource = { kind: 'url', url: 'http://127.0.0.1:4173/' };
  assert.equal(isTrustedRendererURL('http://127.0.0.1:4173/?scene=08', source), true);
  for (const invalid of ['http://127.0.0.1:4174/', 'http://localhost:4173/', 'https://127.0.0.1:4173/', 'file:///tmp/index.html', 'javascript:alert(1)', 'http://127.0.0.1:4173.attacker.example/']) {
    assert.equal(isTrustedRendererURL(invalid, source), false, invalid);
  }
});

test('packaged startup bypasses the preview server but keeps all native bridges main-frame-only', () => {
  const source = readFileSync(new URL('../electron/main.ts', import.meta.url), 'utf8');
  assert.match(source, /app\.isPackaged[\s\S]*kind: 'file', path: join\(app\.getAppPath\(\), 'client', 'index\.html'\)/);
  assert.match(source, /window\.loadFile\(rendererSource\.path\)/);
  assert.match(source, /event\.senderFrame === window\.webContents\.mainFrame/);
  assert.match(source, /isTrustedRendererURL\(event\.senderFrame\.url, rendererSource\)/);
  for (const bridge of ['environment', 'theme', 'import', 'choose-directory', 'github-authorization', 'update-status', 'update-check', 'update-download', 'update-install']) {
    assert.match(source, new RegExp(`ipcMain\\.handle\\('gittogether:${bridge}',[^]*?if \\(!isMainRenderer\\(event\\)\\)`));
  }
  assert.match(source, /contextIsolation: true, nodeIntegration: false, sandbox: true/);
  assert.match(source, /properties: \['openDirectory'\]/);
});

test('desktop build uses relative client assets and a finite production-content allowlist', () => {
  const source = readFileSync(new URL('../scripts/package-desktop.ts', import.meta.url), 'utf8');
  assert.match(source, /configFile: false, root: source, base: '\.\/', envPrefix: \[\]/);
  assert.match(source, /version: manifest\.version/);
  assert.match(source, /main: 'desktop\/main\.cjs'/);
  assert.match(source, /sourcemap: false/);
  assert.match(source, /\['src', 'server', 'electron', 'public', 'index\.html', 'package\.json', 'package-lock\.json'\]/);
  assert.match(source, /sourceDigest\(clientRoot\) !== sourceSha256/);
  assert.doesNotMatch(source, /cp\(clientRoot,|copyFile\([^\n]*\.env|loadEnv\(|GITHUB_CLIENT_SECRET/);
  assert.match(source, /await rm\(temporary, \{ recursive: true, force: true \}\)/);
});
