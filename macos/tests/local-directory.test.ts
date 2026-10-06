import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chooseLocalDirectory, type DirectoryChooser } from '../src/local-directory';
import { LocalDirectoryField } from '../src/LocalRepositoryModal';

test('native chooser returns the exact absolute directory without changing file names', async () => {
  for (const path of ['/Users/test/Projects/my repository', '/Users/test/末尾空格 ', 'C:\\Projects\\Repository', '\\\\server\\share\\Repository']) {
    let calls = 0;
    assert.equal(await chooseLocalDirectory(async () => { calls++; return path; }), path);
    assert.equal(calls, 1);
  }
});

test('cancelling selection leaves the previously selected directory unchanged', async () => {
  let path = '/Users/test/original';
  const chosen = await chooseLocalDirectory(async () => null);
  if (chosen !== null) path = chosen;
  assert.equal(chosen, null);
  assert.equal(path, '/Users/test/original');
});

test('chooser failures are actionable and never suggest a manual input that no longer exists', async () => {
  await assert.rejects(chooseLocalDirectory(async () => { throw new Error('private native details'); }), { message: '无法打开系统文件夹选择器，请重试。' });
  await assert.rejects(chooseLocalDirectory(), /浏览器预览尚未接入系统文件夹选择器/);
});

test('a basename, relative path or malformed response is not a native directory', async () => {
  for (const invalid of ['', 'repository', '~/Projects/repository', 'C:relative', undefined, {}, '/tmp/bad\0path']) {
    const chooser = (async () => invalid) as DirectoryChooser;
    await assert.rejects(chooseLocalDirectory(chooser), /文件夹选择结果无效/);
  }
});

test('empty selection renders one keyboard-accessible folder button, not an editable path', () => {
  const markup = renderToStaticMarkup(createElement(LocalDirectoryField, { path: '', busy: false, choosing: false, onChoose: () => {} }));
  assert.equal((markup.match(/<button/g) || []).length, 1);
  assert.match(markup, /type="button"/);
  assert.match(markup, /aria-labelledby="[^"]+ [^"]+"/);
  assert.match(markup, /本地仓库目录/);
  assert.match(markup, /选择文件夹…/);
  assert.doesNotMatch(markup, /<input|contenteditable|disabled/);
});

test('a selected directory is visible and has a full-path tooltip, while an active chooser cannot reopen', () => {
  const path = '/Users/test/Projects/long repository';
  const selected = renderToStaticMarkup(createElement(LocalDirectoryField, { path, busy: false, choosing: false, onChoose: () => {} }));
  assert.match(selected, /has-path/);
  assert.match(selected, /title="\/Users\/test\/Projects\/long repository"/);
  assert.match(selected, /class="directory-picker-path"[^>]*>\/Users\/test\/Projects\/long repository/);
  const active = renderToStaticMarkup(createElement(LocalDirectoryField, { path, busy: true, choosing: true, onChoose: () => {} }));
  assert.match(active, /disabled=""/);
  assert.match(active, /正在打开…/);
});

test('modal keeps explicit saving, validation, unlink and error handling after removing the two annotations', () => {
  const source = readFileSync(new URL('../src/LocalRepositoryModal.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /关联已有的 Git 工作目录|可以输入绝对路径|TextField|请手动输入/);
  assert.match(source, /await controller\.link\(repository\.id, path\)/);
  assert.match(source, /if \(chosen !== null\) setPath\(chosen\)/);
  assert.match(source, /disabled=\{busy \|\| !path\.trim\(\) \|\| !repository\.available\}/);
  assert.match(source, /controller\.unlink\(repository\.id\)/);
  assert.match(source, /<Notice kind="error">\{error\}<\/Notice>/);
  assert.match(source, /解除关联只移除应用记录，不删除本地目录/);
});
