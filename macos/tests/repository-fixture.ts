// Test-only repositories; never loaded by the application or account service.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execute = promisify(execFile);
export async function createRepositoryFixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'gittogether-three-column-qa-')));
  const directory = join(root, 'main');
  const feature = join(root, 'feature task');
  const hooks = join(root, 'hooks');
  await mkdir(directory); await mkdir(hooks);
  const git = (path: string, args: string[]) => execute('git', ['-c', `core.hooksPath=${hooks}`, '-c', 'commit.gpgSign=false', '-C', path, ...args]);
  await git(directory, ['init', '-b', 'main']);
  await git(directory, ['config', 'user.name', 'QA']); await git(directory, ['config', 'user.email', 'qa@example.test']);
  await mkdir(join(directory, 'src')); await mkdir(join(directory, 'docs'));
  await writeFile(join(directory, 'src/app.ts'), 'export const value = 0;\n');
  await writeFile(join(directory, 'src/:(top)all.ts'), 'export const literal = 0;\n');
  await writeFile(join(directory, 'docs/notes.md'), '# Project notes\n');
  await writeFile(join(directory, '.gitignore'), 'ignored.txt\n');
  await writeFile(join(directory, 'README.md'), '# Repository workspace\n');
  await git(directory, ['add', '.']); await git(directory, ['commit', '-m', 'Initial project structure']);
  await git(directory, ['branch', 'task/review']);
  await git(directory, ['worktree', 'add', '-b', 'task/search', feature]);
  await writeFile(join(feature, 'src/search.ts'), 'export const search = true;\n');
  await git(feature, ['add', '.']); await git(feature, ['commit', '-m', 'Add repository search']);
  await writeFile(join(directory, 'docs/layout.md'), '# Three column layout\n');
  await git(directory, ['add', '.']); await git(directory, ['commit', '-m', 'Document workspace layout']);
  await git(directory, ['merge', '--no-ff', 'task/search', '-m', 'Merge search task']);
  await writeFile(join(directory, 'src/app.ts'), 'export const value = 10;\n');
  await writeFile(join(directory, 'src/:(top)all.ts'), 'export const literal = 1;\n');
  await writeFile(join(directory, 'src/new.ts'), 'export const local = true;\n');
  await writeFile(join(directory, 'ignored.txt'), 'test-only ignored\n');
  await writeFile(join(feature, 'src/app.ts'), 'export const value = 20;\n');
  const before = await Promise.all([directory, feature].map(async path => ({
    path, head: (await git(path, ['rev-parse', 'HEAD'])).stdout,
    branch: (await git(path, ['symbolic-ref', 'HEAD'])).stdout,
    index: await readFile((await git(path, ['rev-parse', '--path-format=absolute', '--git-path', 'index'])).stdout.trim()),
  })));
  const unchanged = async () => Promise.all(before.map(async value => {
    const index = await readFile((await git(value.path, ['rev-parse', '--path-format=absolute', '--git-path', 'index'])).stdout.trim());
    return value.head === (await git(value.path, ['rev-parse', 'HEAD'])).stdout && value.branch === (await git(value.path, ['symbolic-ref', 'HEAD'])).stdout && value.index.equals(index);
  })).then(values => values.every(Boolean));
  return { root, directory, feature, git, unchanged, cleanup: () => rm(root, { recursive: true, force: true }) };
}
