import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createRepositoryFixture } from './repository-fixture';
import { createRemoteServiceFixture } from './remote-service-fixture';
import { downloadBranchWorktree } from '../server/branch-download';
import { AccountService, type SavedState } from '../server/account-service';
import { isCatalog, type Account, type RemoteRepository } from '../src/import-model';
import { branchDownloadFolderName, isDownloadFolderName } from '../src/branch-download-model';

test('branch download creates depth-one worktrees without overwriting another checkout or destination', { timeout: 15_000 }, async t => {
  const f = await createRepositoryFixture();
  const remotes = join(f.root, 'remotes'); await mkdir(join(remotes, 'qa'), { recursive: true });
  await f.git(f.directory, ['clone', '--bare', f.directory, join(remotes, 'qa/project.git')]);
  const reservation = createServer(); await new Promise<void>(done => reservation.listen(0, '127.0.0.1', done));
  const address = reservation.address(); assert.ok(address && typeof address !== 'string');
  const port = address.port; await new Promise<void>(done => reservation.close(() => done()));
  const daemon = spawn('git', ['daemon', '--verbose', '--reuseaddr', '--export-all', `--base-path=${remotes}`, '--listen=127.0.0.1', `--port=${port}`, remotes], { stdio: ['ignore', 'ignore', 'pipe'] });
  t.after(async () => { if (daemon.exitCode === null && daemon.signalCode === null) { daemon.kill(); await once(daemon, 'exit'); } await f.cleanup(); });
  await new Promise<void>((done, reject) => {
    const timer = setTimeout(() => reject(new Error('Fixture Git daemon did not become ready')), 3_000);
    daemon.once('error', error => { clearTimeout(timer); reject(error); });
    daemon.once('exit', () => { clearTimeout(timer); reject(new Error('Fixture Git daemon exited')); });
    daemon.stderr.on('data', chunk => { if (String(chunk).includes('Ready to rumble')) { clearTimeout(timer); done(); } });
  });
  const account: Account = { id: 'qa', provider: 'gitea', host: `git://127.0.0.1:${port}`, login: 'qa', name: 'QA', updatedAt: '' };
  const repository: RemoteRepository = { id: 'qa:1', remoteId: 1, accountId: account.id, name: 'project', fullName: 'qa/project', description: '', defaultBranch: 'main', private: false, available: true, url: `${account.host}/qa/project` };
  const parentPath = join(f.root, 'downloads'); await mkdir(parentPath);
  const storageRoot = join(f.root, 'objects');
  const input = { account, repository, token: 'fixture-only-token', branch: 'main', parentPath, folderName: 'main', storageRoot, validate: () => {} };
  const main = await downloadBranchWorktree(input);
  assert.equal(main, join(parentPath, 'main')); assert.equal((await stat(join(main, '.git'))).isFile(), true);
  assert.equal((await f.git(main, ['symbolic-ref', '--short', 'HEAD'])).stdout.trim(), 'main');
  assert.equal((await f.git(main, ['rev-list', '--count', 'HEAD'])).stdout.trim(), '1');
  assert.equal(await readFile(join(main, 'README.md'), 'utf8'), '# Repository workspace\n');
  assert.equal((await f.git(main, ['remote', 'get-url', 'origin'])).stdout.trim(), `${repository.url}.git`);
  assert.doesNotMatch((await f.git(main, ['config', '--local', '--list'])).stdout, /fixture-only-token/);
  await assert.rejects(downloadBranchWorktree(input), /目标文件夹已存在/);
  await assert.rejects(downloadBranchWorktree({ ...input, folderName: 'another-main' }), /已有下载目录/);
  const oldHead = (await f.git(main, ['rev-parse', 'HEAD'])).stdout;
  const feature = await downloadBranchWorktree({ ...input, branch: 'task/search', folderName: 'search' });
  assert.equal((await f.git(feature, ['symbolic-ref', '--short', 'HEAD'])).stdout.trim(), 'task/search');
  assert.equal((await f.git(feature, ['rev-list', '--count', 'HEAD'])).stdout.trim(), '1');
  assert.equal((await f.git(main, ['rev-parse', 'HEAD'])).stdout, oldHead);
  assert.equal((await readdir(storageRoot)).filter(name => name.endsWith('.git')).length, 1);
  assert.deepEqual((await readdir(parentPath)).sort(), ['main', 'search']);
  assert.equal(await f.unchanged(), true);
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(downloadBranchWorktree({ ...input, folderName: 'cancelled', signal: cancelled.signal }), { name: 'AbortError' });
  await assert.rejects(downloadBranchWorktree({ ...input, branch: '--unsafe', folderName: 'unsafe' }), /分支名称无效/);
  await assert.rejects(downloadBranchWorktree({ ...input, branch: 'missing', folderName: 'missing' }), /远端分支已不存在/);
  assert.deepEqual((await readdir(parentPath)).sort(), ['main', 'search']);
});

test('folder names remain one bounded path component', () => {
  assert.equal(branchDownloadFolderName('project', 'feature/a'), 'project-feature-a');
  assert.equal(branchDownloadFolderName('project', 'x'.repeat(200)).length, 160);
  for (const name of ['', '.', '..', '../outside', '/absolute', 'bad\\name', 'bad\0name', 'bad.', 'bad ', 'x'.repeat(161)]) assert.equal(isDownloadFolderName(name), false, name);
  assert.equal(isDownloadFolderName('project-main'), true);
});

test('a failed legacy association cannot be converted into a false branch while downloading', async t => {
  const f = await createRemoteServiceFixture('gitea'); t.after(f.cleanup);
  const base = await f.service.handle('catalog', {}); assert.ok(isCatalog(base));
  const repository = base.repositories[0]; await f.git(f.directory, ['remote', 'add', 'origin', repository.url]);
  const saved: SavedState = { version: 2, accounts: base.accounts.map(account => ({ account, token: 'fixture-persisted-token' })), repositories: base.repositories, links: [{ repositoryId: repository.id, path: f.directory }] };
  let writes = 0;
  const service = new AccountService({ kind: 'encrypted', load: async () => structuredClone(saved), save: async () => { writes++; } }, fetch, { downloadRoot: join(f.root, 'objects') });
  await f.git(f.directory, ['remote', 'set-url', 'origin', 'https://git.fixture.test/other/repository']);
  await assert.rejects(service.handle('downloadBranch', { repositoryId: repository.id, branch: 'new', parentPath: f.root, folderName: 'new' }), /已有工作目录读取未完成/);
  await assert.rejects(service.handle('downloadBranch', { repositoryId: repository.id, branch: 'new', parentPath: f.root, folderName: 'new', command: 'unsafe' }), /仅接受/);
  const after = await service.handle('catalog', {}); assert.ok(isCatalog(after));
  assert.deepEqual(after.links, saved.links); assert.equal(writes, 0);
  assert.equal((await readdir(f.root)).includes('objects'), false);
});
