import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const desktopRequire = createRequire(join(root, 'desktop/package.json'));
const uiRequire = createRequire(join(root, 'macos/package.json'));
const ts = desktopRequire('typescript');
function load(file, mocks) {
  const source = ts.transpileModule(readFileSync(join(root, 'desktop/app', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  new Function('exports', 'require', source)(exports, name => {
    assert.ok(Object.hasOwn(mocks, name), `Unexpected dependency ${name}`);
    return mocks[name];
  });
  return exports;
}

test('tag version reaches the Desktop build metadata and runtime constants', () => {
  const previous = process.env.GITTOGETHER_VERSION;
  try {
    const pkg = { version: '0.38.1', productName: 'GitTogether' };
    const info = load('package-info.ts', { './package.json': pkg });
    const app = load('app-info.ts', {
      './package.json': pkg,
      './git-info': { getSHA: () => 'a'.repeat(40) },
      '../script/dist-info': { getUpdatesURL: () => 'https://example.test/updates', getChannel: () => 'production' },
    });
    delete process.env.GITTOGETHER_VERSION;
    assert.equal(info.getVersion(), pkg.version);
    assert.equal(JSON.parse(app.getReplacements().__APP_VERSION__), pkg.version);
    process.env.GITTOGETHER_VERSION = '0.38.2';
    assert.equal(info.getVersion(), '0.38.2');
    assert.equal(JSON.parse(app.getReplacements().__APP_VERSION__), '0.38.2');
  } finally {
    if (previous === undefined) delete process.env.GITTOGETHER_VERSION;
    else process.env.GITTOGETHER_VERSION = previous;
  }
});

test('Material client bundles the tag version and falls back to its source version for development', async t => {
  const { build } = await import(pathToFileURL(uiRequire.resolve('vite')).href);
  const directory = mkdtempSync(join(tmpdir(), 'gittogether-version-build-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const baseline = JSON.parse(readFileSync(join(root, 'macos/package.json'), 'utf8')).version;
  for (const [override, expected] of [['0.38.2', '0.38.2'], ['', baseline]]) {
    const result = await build({
      root: directory, configFile: false, logLevel: 'silent',
      define: { 'import.meta.env.VITE_GITTOGETHER_VERSION': JSON.stringify(override) },
      build: { write: false, minify: false, lib: { entry: join(root, 'macos/src/product-version.ts'), formats: ['es'], fileName: 'product-version' } },
    });
    const outputs = Array.isArray(result) ? result.flatMap(value => value.output) : result.output;
    const chunk = outputs.find(item => item.type === 'chunk');
    const bundled = await import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`);
    assert.equal(bundled.productVersion, expected);
  }
});
