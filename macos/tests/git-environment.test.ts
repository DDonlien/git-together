import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { gitToolEnvironment } from '../server/git-environment';

const execute = promisify(execFile);
const finderPath = '/usr/bin:/bin:/usr/sbin:/sbin';

test('Git tool paths preserve inherited precedence, remove duplicates and keep the parent environment unchanged', () => {
  const inherited = { PATH: `/custom/bin${delimiter}/usr/local/bin${delimiter}/custom/bin`, LANG: 'qa', GIT_DIR: '/isolated' };
  const environment = gitToolEnvironment(inherited);
  assert.equal(inherited.PATH, `/custom/bin${delimiter}/usr/local/bin${delimiter}/custom/bin`);
  assert.equal(environment.LANG, inherited.LANG);
  if (process.platform === 'darwin') {
    assert.deepEqual(environment.PATH?.split(delimiter), ['/custom/bin', '/usr/local/bin', join(homedir(), '.local', 'bin'), '/opt/homebrew/bin']);
    assert.equal(gitToolEnvironment({}).PATH?.startsWith(`${finderPath}:`), true);
  } else assert.equal(environment, inherited);
});

test('a Finder-launched Git process finds user-installed LFS in both Git commands and a real pre-push hook', { skip: process.platform !== 'darwin' }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'gittogether-lfs-path-')); t.after(() => rm(root, { recursive: true, force: true }));
  const home = join(root, 'home'), tools = join(home, '.local', 'bin'), local = join(root, 'local'), bare = join(root, 'remote.git'), called = join(root, 'lfs-called');
  await mkdir(tools, { recursive: true }); await mkdir(local);
  const lfs = join(tools, 'git-lfs');
  await writeFile(lfs, '#!/bin/sh\ncase "$1" in\nversion) printf "git-lfs isolated-qa\\n" ;;\npre-push) printf "%s\\n" "$@" > "$GITTOGETHER_QA_LFS_CALL" ;;\n*) exit 3 ;;\nesac\n'); await chmod(lfs, 0o700);
  const env = { ...process.env, HOME: home, PATH: finderPath, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GITTOGETHER_QA_LFS_CALL: called };
  const git = async (directory: string, args: string[]) => (await execute('/usr/bin/git', ['-c', 'commit.gpgsign=false', '-C', directory, ...args], { env })).stdout.trim();
  await git(root, ['init', '--bare', bare]); await git(local, ['init', '-b', 'main']);
  await git(local, ['config', 'user.name', 'QA']); await git(local, ['config', 'user.email', 'qa@example.test']);
  await writeFile(join(local, 'README.md'), 'isolated Finder path regression\n'); await git(local, ['add', '.']); await git(local, ['commit', '-m', 'isolated']);
  const hook = join(local, '.git', 'hooks', 'pre-push');
  await writeFile(hook, '#!/bin/sh\ncommand -v git-lfs >/dev/null 2>&1 || { printf "git-lfs not found\\n" >&2; exit 2; }\ngit lfs pre-push "$@"\n'); await chmod(hook, 0o700);
  // The unrepaired Finder path fails before changing the disposable remote.
  await assert.rejects(git(local, ['push', bare, 'main']), /git-lfs not found/);
  const script = `import { runGitProcess } from './server/git-process.ts';
    console.log((await runGitProcess(process.env.QA_LOCAL, ['lfs', 'version'])).trim());
    await runGitProcess(process.env.QA_LOCAL, ['push', process.env.QA_BARE, 'HEAD:refs/heads/main']);`;
  const output = await execute(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], { cwd: process.cwd(), env: { ...env, QA_LOCAL: local, QA_BARE: bare } });
  assert.match(output.stdout, /git-lfs isolated-qa/); assert.match(await readFile(called, 'utf8'), /^pre-push\n/);
  assert.equal(await git(bare, ['rev-parse', 'refs/heads/main']), await git(local, ['rev-parse', 'HEAD']));
});
