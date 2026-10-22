import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const require = createRequire(new URL('../desktop/package.json', import.meta.url));
const ts = require('typescript');
function module(path) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(source, { exports, Buffer }, { filename: path });
  return exports;
}
const { remoteFilePage, selectedRemoteFiles } = module('../desktop/app/src/ui/gittogether/remote-file-pages.ts');
const { remoteFileSelection } = module('../macos/src/remote-control-model.ts');
const files = Array.from({ length: 2067 }, (_, i) => ({ path: 'Content/' + '长路径目录/'.repeat(28) + String(i).padStart(5, '0') + '.uasset', status: 'M', tracked: true }));

test('over 1000 long paths are returned in byte-bounded, complete, ordered pages', () => {
  assert.ok(Buffer.byteLength(JSON.stringify(files)) > 96 * 1024);
  const loaded = [];
  let cursor = 0, pages = 0;
  do {
    const page = remoteFilePage(files, cursor);
    assert.equal(page.filePage.offset, loaded.length);
    assert.equal(page.filePage.total, files.length);
    assert.ok(page.files.length <= 100 && Buffer.byteLength(JSON.stringify(page.files)) <= 48 * 1024);
    loaded.push(...page.files); pages++;
    cursor = page.filePage.nextCursor;
  } while (cursor !== undefined);
  assert.ok(pages > 20);
  assert.deepEqual(loaded, files);
  for (const cursor of [-1, 0.5, NaN, files.length + 1, '0']) assert.throws(() => remoteFilePage(files, cursor), /游标/);
});
test('all includes unloaded files and compact exceptions preserve only the intended scope', () => {
  const excluded = new Set([0, 1, 999, 1000, 2066]);
  const encoded = remoteFileSelection(true, excluded);
  assert.equal(JSON.stringify(encoded), '{"all":true,"ranges":[[0,1],[999,1000],[2066,2066]]}');
  const selected = selectedRemoteFiles(files, encoded);
  assert.equal(selected.length, files.length - excluded.size);
  assert.ok(selected.every(file => !excluded.has(files.indexOf(file))));
  const explicit = remoteFileSelection(false, new Set([0, 1001, 2066]));
  assert.deepEqual([...selectedRemoteFiles(files, explicit)], [files[0], files[1001], files[2066]]);
  assert.equal(selectedRemoteFiles(files, { all: true, ranges: [] }).length, 2067);
  assert.equal(selectedRemoteFiles(files, { all: false, ranges: [] }).length, 0);
});
test('range selection rejects overlapping, unordered, negative and out-of-snapshot indices', () => {
  for (const ranges of [[[0, 3], [3, 5]], [[4, 4], [1, 1]], [[-1, 0]], [[0, 2067]], [[0.1, 2]], [[3, 1]]]) assert.throws(() => selectedRemoteFiles(files, { all: false, ranges }), /范围/);
});
