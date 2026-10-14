import test from 'node:test';
import assert from 'node:assert/strict';
import { branchDownloadFolderName, repositoryDownloadFolderName } from '../src/branch-download-model';
import { displayLocalPath, joinLocalPath } from '../src/local-directory';
import { associationStatus, repositoryLocalDirectory } from '../src/branch-links';
import type { LocalLink } from '../src/import-model';

const link = (paths: string[]): LocalLink => ({ repositoryId: 'fixture:project', path: 'D:\\Projects\\Gitea', worktrees: paths.map((path, index) => ({ branch: index ? `feature/${index}` : 'main', path })) });

test('default download uses a repository container and an underscore before the safe branch name', () => {
  assert.equal(branchDownloadFolderName('project-name', 'main'), 'project-name_main');
  assert.equal(branchDownloadFolderName('project-name', 'codex/feature'), 'project-name_codex-feature');
  assert.equal(repositoryDownloadFolderName('project:name.'), 'project-name');
  assert.equal(joinLocalPath('D:\\FOLDER', 'project-name', branchDownloadFolderName('project-name', 'main')), 'D:\\FOLDER\\project-name\\project-name_main');
  assert.equal(joinLocalPath('/Users/test/FOLDER', 'project-name', branchDownloadFolderName('project-name', 'main')), '/Users/test/FOLDER/project-name/project-name_main');
});

test('preview paths use drive, UNC or macOS separators without altering the original input', () => {
  for (const [parent, expected] of [
    ['D:/FOLDER\\nested/', 'D:\\FOLDER\\nested\\project\\custom-folder'],
    ['D:\\', 'D:\\project\\custom-folder'],
    ['\\\\server\\share/FOLDER', '\\\\server\\share\\FOLDER\\project\\custom-folder'],
    ['//server/share/FOLDER/', '\\\\server\\share\\FOLDER\\project\\custom-folder'],
    ['/Users/test/FOLDER/', '/Users/test/FOLDER/project/custom-folder'],
    ['/', '/project/custom-folder'],
  ]) assert.equal(joinLocalPath(parent, 'project', 'custom-folder'), expected);
  assert.equal(displayLocalPath('/Users/test/末尾空格 '), '/Users/test/末尾空格 ');
});

test('one default worktree displays the project container while retaining its actual saved path', () => {
  for (const [path, expected] of [
    ['D:\\FOLDER\\project-name\\project-name_main', 'D:\\FOLDER\\project-name'],
    ['D:/FOLDER/project-name/project-name_codex-feature', 'D:\\FOLDER\\project-name'],
    ['/Users/test/FOLDER/project-name/project-name_main', '/Users/test/FOLDER/project-name'],
  ]) {
    const mapping = link([path]);
    const previous = structuredClone(mapping);
    assert.equal(repositoryLocalDirectory('project-name', mapping), expected);
    assert.deepEqual(mapping, previous);
  }
});

test('one ordinary worktree shows itself rather than the originally selected parent', () => {
  assert.equal(repositoryLocalDirectory('clash-config', link(['D:\\Projects\\Gitea\\clash-config'])), 'D:\\Projects\\Gitea\\clash-config');
  assert.equal(repositoryLocalDirectory('project-name', link(['/FOLDER/project-name/custom-folder'])), '/FOLDER/project-name/custom-folder');
  assert.equal(repositoryLocalDirectory('project-name', link(['/FOLDER/unrelated/project-name_main'])), '/FOLDER/unrelated/project-name_main');
  assert.equal(repositoryLocalDirectory('project-name', { repositoryId: 'fixture', path: '/FOLDER/project-name' }), '/FOLDER/project-name');
  assert.equal(repositoryLocalDirectory('project-name'), undefined);
  assert.equal(repositoryLocalDirectory('project-name', { repositoryId: 'fixture', path: '/FOLDER', worktrees: [] }), undefined);
  assert.equal(repositoryLocalDirectory('project-name', link(['D:\\'])), 'D:\\');
  assert.equal(repositoryLocalDirectory('project-name', link(['/'])), '/');
});

test('association tooltip describes the displayed directory while preserving the selected scan scope', () => {
  const mapping = link(['D:\\Projects\\Gitea\\clash-config']);
  const directory = repositoryLocalDirectory('clash-config', mapping);
  const local = { path: mapping.path, workspace: { tasks: [{ id: 'worktree:main', branch: 'main', head: 'a'.repeat(40), path: mapping.worktrees![0].path, tree: [], files: [], error: '' }], commits: [], complete: true }, loading: false, error: '' };
  const status = associationStatus(mapping, local, { workspace: null, loading: false, error: '' }, undefined, directory);
  assert.ok(status.detail.endsWith('D:\\Projects\\Gitea\\clash-config'));
  assert.equal(mapping.path, 'D:\\Projects\\Gitea');
});

test('multiple worktrees in mixed folders use the minimum common parent by complete path components', () => {
  assert.equal(repositoryLocalDirectory('project-name', link(['D:\\FOLDER\\Project-name\\worktree-1', 'D:\\FOLDER\\folder-2\\worktree-2', 'D:\\FOLDER\\worktree-3'])), 'D:\\FOLDER');
  assert.equal(repositoryLocalDirectory('project-name', link(['/FOLDER/Project-name/worktree-1', '/FOLDER/folder-2/worktree-2', '/FOLDER/worktree-3'])), '/FOLDER');
  assert.equal(repositoryLocalDirectory('project-name', link(['/FOLDER/project-name/project-name_main', '/FOLDER/project-name/project-name_feature'])), '/FOLDER/project-name');
  assert.equal(repositoryLocalDirectory('project', link(['/FOLDER/prefix-one/main', '/FOLDER/prefix-two/main'])), '/FOLDER');
  assert.equal(repositoryLocalDirectory('project', link(['D:\\one', 'D:\\two'])), 'D:\\');
});

test('Windows case and separator duplicates are one worktree, and different roots have no invented common folder', () => {
  assert.equal(repositoryLocalDirectory('project', link(['D:\\FOLDER\\project\\project_main', 'd:/folder/project/project_main'])), 'd:\\folder\\project');
  assert.equal(repositoryLocalDirectory('project', link(['D:\\one', 'E:\\two'])), 'D:\\one；E:\\two');
  assert.equal(repositoryLocalDirectory('project', link(['\\\\server\\one\\main', '\\\\server\\two\\feature'])), '\\\\server\\one\\main；\\\\server\\two\\feature');
});
