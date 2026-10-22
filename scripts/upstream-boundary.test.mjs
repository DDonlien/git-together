import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
test('all upstream execution code matches the pinned release', () => {
  const run = spawnSync(process.execPath, ['scripts/verify-upstream.mjs'], { cwd: root, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
});
test('the active runtime cannot load the retired Git or account services', () => {
  const dir = resolve(root, 'desktop/app/src/ui/gittogether');
  for (const name of readdirSync(dir).filter(n => /\.tsx?$/.test(n))) {
    const source = readFileSync(resolve(dir, name), 'utf8');
    assert.doesNotMatch(source, /macos\/(?:server|electron|src-tauri)|AccountService|execFile\(|execSync\(/, name);
  }
  const run = readFileSync(resolve(root, 'scripts/desktop.mjs'), 'utf8');
  assert.doesNotMatch(run, /tauri(?:\s+dev|\/Cargo\.toml)|server\/account-service/);
});
test('Presence delegates execution and cannot run Git itself', () => {
  const git = readFileSync(resolve(root, 'desktop/gittogether-presence/src/git.rs'), 'utf8');
  const remote = readFileSync(resolve(root, 'desktop/gittogether-presence/src/remote_git.rs'), 'utf8');
  assert.match(git, /call\("unpublished"/);
  assert.match(remote, /call\("execute"/);
  assert.doesNotMatch(git + remote, /Command::new|crate::operations|crate::provider/);
});

test('all supported app entrypoints use Desktop and the old service proxy is absent', () => {
  const pkg = JSON.parse(readFileSync(resolve(root, 'macos/package.json'), 'utf8'));
  for (const name of ['dev', 'desktop', 'dev:ui', 'dev:rust', 'preview', 'tauri']) assert.match(pkg.scripts[name], /scripts\/desktop\.mjs dev/);
  assert.doesNotMatch(readFileSync(resolve(root, 'macos/vite.config.mjs'), 'utf8'), /4175|proxy/);
});

test('the replacement cannot mount upstream chrome, themes or icon views', () => {
  const boot = readFileSync(resolve(root, 'desktop/app/src/ui/index.tsx'), 'utf8');
  assert.match(boot, /GitTogetherApp as App/);
  assert.doesNotMatch(boot, /require\('\.\.\/\.\.\/styles\/desktop\.scss'\)/);
  const crash = readFileSync(resolve(root, 'desktop/app/src/crash/index.tsx'), 'utf8');
  assert.doesNotMatch(crash, /require\('\.\/styles\/crash\.scss'\)/);
  const app = readFileSync(resolve(root, 'desktop/app/src/ui/gittogether/application.tsx'), 'utf8');
  assert.doesNotMatch(app, /super\.render\(|renderApp\(|renderWelcomeFlow\(|renderToolbar\(/);
  const icon = readFileSync(resolve(root, 'desktop/app/src/ui/octicons/octicon.tsx'), 'utf8');
  assert.match(icon, /<MaterialIcon/);
  assert.doesNotMatch(icon, /paths\.map|symbol\.p|<path/);
});

test('original dialog and operation controller callbacks remain unchanged', async () => {
  const { controllerState } = await import('./presentation-controller-state.mjs');
  const lock = JSON.parse(readFileSync(resolve(root, 'docs/github-desktop-upstream.json'), 'utf8'));
  assert.ok(Object.keys(lock.uiControllerSha256).length > 25);
  for (const [path, sha] of Object.entries(lock.uiControllerSha256)) assert.equal(controllerState(resolve(root, 'desktop'), path), sha, path);
});

test('main process differences contain product copy only', async () => {
  const { createHash } = await import('node:crypto');
  const lock = JSON.parse(readFileSync(resolve(root, 'docs/github-desktop-upstream.json'), 'utf8'));
  for (const path of ['app/src/main-process/menu/build-default-menu.ts', 'app/src/main-process/show-uncaught-exception.ts', 'app/static/index.html']) {
    const normalized = readFileSync(resolve(root, 'desktop', path), 'utf8').replaceAll('GitTogether', 'GitHub Desktop').replaceAll('https://github.com/DDonlien/git-together/issues', 'https://github.com/desktop/desktop/issues');
    assert.equal(createHash('sha256').update(normalized).digest('hex'), lock.sha256[path], path);
  }
});
