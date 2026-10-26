import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as Path from 'node:path';
import vm from 'node:vm';

const root = Path.resolve(import.meta.dirname, '..');
const require = createRequire(new URL('../desktop/package.json', import.meta.url));
const ts = require('typescript');
const fixture = realpathSync.native(mkdtempSync(Path.join(tmpdir(), 'gittogether-worktrees-')));
const hooks = Path.join(fixture, 'hooks');
mkdirSync(hooks);
after(() => {
  assert.equal(Path.dirname(fixture), realpathSync.native(tmpdir()));
  rmSync(fixture, { recursive: true, force: true });
});

function loadSource(path, imports = {}) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(Path.join(root, path), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(source, { exports, require: name => {
    assert.ok(Object.hasOwn(imports, name), 'Unexpected dependency: ' + name);
    return imports[name];
  } }, { filename: path });
  return exports;
}

// Exercise the original parser; Git execution and path recovery imports are unused.
const { parseWorktreePorcelainOutput } = loadSource('desktop/app/src/lib/git/worktree.ts', {
  path: Path, '../path-exists': {}, './core': {},
});
const { isCheckoutWorktree } = loadSource('desktop/app/src/ui/gittogether/worktree.ts');

function git(path, args) {
  return execFileSync('git', [
    '-c', 'core.hooksPath=' + hooks,
    '-c', 'commit.gpgsign=false',
    '-c', 'user.name=Fixture',
    '-c', 'user.email=fixture@example.invalid',
    '-C', path, ...args,
  ], { encoding: 'utf8', env: {
    ...process.env, GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
  } });
}

function initCheckout(name) {
  const path = Path.join(fixture, name);
  git(fixture, ['init', '--template=', '--initial-branch=main', path]);
  return realpathSync(path);
}

function worktrees(path) {
  return Array.from(parseWorktreePorcelainOutput(git(path, ['worktree', 'list', '--porcelain', '-z'])));
}

test('bare storage is excluded while its linked checkout and objects remain available', () => {
  const seed = initCheckout('seed');
  git(seed, ['commit', '--allow-empty', '-m', 'fixture']);
  const store = Path.join(fixture, 'shared.git');
  const checkout = Path.join(fixture, 'linked');
  git(fixture, ['clone', '--bare', seed, store]);
  git(store, ['worktree', 'add', checkout, 'main']);
  const before = git(checkout, ['rev-parse', 'HEAD']).trim();
  const listed = worktrees(checkout);
  assert.ok(listed.some(entry => entry.path === realpathSync(store) && entry.head === ''));

  const available = listed.filter(isCheckoutWorktree);
  assert.equal(available.length, 1);
  assert.equal(available[0].path, realpathSync(checkout));
  assert.equal(available[0].branch, 'refs/heads/main');
  assert.equal(available[0].type, 'linked');
  assert.equal(git(store, ['rev-parse', '--is-bare-repository']).trim(), 'true');
  assert.equal(git(checkout, ['rev-parse', 'HEAD']).trim(), before);
  assert.equal(git(checkout, ['status', '--porcelain']), '');
});

test('bare storage without linked checkouts supplies no working directory', () => {
  const store = Path.join(fixture, 'empty.git');
  git(fixture, ['init', '--bare', '--template=', store]);
  assert.deepEqual(worktrees(store).filter(isCheckoutWorktree), []);
});

test('ordinary and detached checkouts stay available while prunable directories are excluded', () => {
  const main = initCheckout('ordinary.git');
  git(main, ['commit', '--allow-empty', '-m', 'fixture']);
  const detached = Path.join(fixture, 'detached');
  const stale = Path.join(fixture, 'stale');
  git(main, ['worktree', 'add', '--detach', detached, 'HEAD']);
  git(main, ['worktree', 'add', '--detach', stale, 'HEAD']);
  assert.equal(Path.dirname(stale), fixture);
  rmSync(stale, { recursive: true });
  const listed = worktrees(main);
  assert.ok(listed.some(entry => entry.path === stale && entry.isPrunable));

  const available = listed.filter(isCheckoutWorktree);
  assert.equal(available.length, 2);
  assert.equal(available.find(entry => entry.type === 'main')?.path, main);
  assert.equal(available.find(entry => entry.isDetached)?.path, realpathSync(detached));
});

test('an unborn checkout with an all-zero HEAD remains available', () => {
  const path = initCheckout('unborn');
  const available = worktrees(path).filter(isCheckoutWorktree);
  assert.equal(available.length, 1);
  assert.equal(available[0].path, path);
  assert.match(available[0].head, /^0+$/);
  assert.equal(available[0].branch, 'refs/heads/main');
  assert.equal(available[0].type, 'main');
});
