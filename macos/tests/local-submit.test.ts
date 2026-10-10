import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { chmod, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRepositoryFixture } from './repository-fixture';
import { createRemoteServiceFixture } from './remote-service-fixture';
import { readRepositoryWorkspace } from '../server/repository-reader';
import { submitLocalCommit } from '../server/local-submit';
import { codexGenerationFailure, generateCommitDraft } from '../server/commit-generator';
import { importMiddleware } from '../server/http-api';
import { importAPI } from '../src/import-api';
import { type LocalSubmitInput } from '../src/local-submit-model';

test('Codex failure messages distinguish authentication, timeout and ordinary login mentions without exposing diagnostics', () => {
  for (const stderr of ['unexpected status code: 401 Unauthorized', 'HTTP 401', 'refresh_token_expired']) {
    assert.match(codexGenerationFailure({ stderr: `${stderr}\nprivate-token-value` }).message, /身份验证失败/);
    assert.doesNotMatch(codexGenerationFailure({ stderr: `${stderr}\nprivate-token-value` }).message, /private-token-value/);
  }
  assert.match(codexGenerationFailure({ killed: true, stderr: 'HTTP 401' }).message, /超时/);
  assert.doesNotMatch(codexGenerationFailure({ stderr: 'warning: login setting unavailable' }).message, /身份验证失败/);
});

async function intent(root: string, repositoryId = 'fixture'): Promise<LocalSubmitInput> {
  const task = (await readRepositoryWorkspace(root, new Set([root]))).tasks.find(task => task.path === root)!;
  return { repositoryId, taskId: task.id, expectedHead: task.head, changeKey: task.changeKey!, operationId: randomUUID(), summary: '提交真实更改', description: '保留摘要和正文\n  第二行缩进' };
}
async function prepare(fixture: Awaited<ReturnType<typeof createRepositoryFixture>>) {
  await fixture.git(fixture.directory, ['config', 'commit.gpgsign', 'false']);
  await fixture.git(fixture.directory, ['config', 'core.hooksPath', join(fixture.root, 'hooks')]);
}

test('commit includes current staged, unstaged, deleted, renamed, binary and literal untracked paths in one worktree only', async t => {
  const fixture = await createRepositoryFixture({ localAhead: true }); t.after(fixture.cleanup); await prepare(fixture);
  const featureHead = (await fixture.git(fixture.feature, ['rev-parse', 'HEAD'])).stdout;
  const remoteHead = (await fixture.git(fixture.directory, ['rev-parse', 'refs/remotes/origin/main'])).stdout;
  await fixture.git(fixture.directory, ['mv', 'docs/notes.md', 'docs/renamed notes.md']);
  await rm(join(fixture.directory, 'README.md'));
  await writeFile(join(fixture.directory, 'binary.dat'), Buffer.from([0, 1, 2]));
  await writeFile(join(fixture.directory, 'src/staged.ts'), 'export const staged = 2;\n');
  const input = await intent(fixture.directory);
  const result = await submitLocalCommit(fixture.directory, input, () => {});
  assert.notEqual(result.commitId, input.expectedHead); assert.equal(result.branch, 'main'); assert.equal(result.warning, undefined);
  assert.equal((await fixture.git(fixture.directory, ['show', '-s', '--format=%B'])).stdout.trim(), `${input.summary}\n\n${input.description}`);
  assert.equal((await fixture.git(fixture.directory, ['show', 'HEAD:src/staged.ts'])).stdout, 'export const staged = 2;\n');
  const paths = (await fixture.git(fixture.directory, ['ls-tree', '-r', '--name-only', 'HEAD'])).stdout;
  assert.match(paths, /binary.dat|docs\/renamed notes.md/); assert.doesNotMatch(paths, /README.md|ignored.txt/);
  assert.equal((await fixture.git(fixture.directory, ['status', '--porcelain'])).stdout, '');
  assert.equal((await fixture.git(fixture.directory, ['diff', '--cached', '--name-only'])).stdout, '');
  assert.equal((await fixture.git(fixture.feature, ['rev-parse', 'HEAD'])).stdout, featureHead);
  assert.equal((await fixture.git(fixture.directory, ['rev-parse', 'refs/remotes/origin/main'])).stdout, remoteHead);
});

test('failed hooks and signatures preserve HEAD and original staging bytes and do not expose hook output', async t => {
  const fixture = await createRepositoryFixture({ localAhead: true }); t.after(fixture.cleanup); await prepare(fixture);
  const indexPath = join(fixture.directory, '.git/index'), before = await readFile(indexPath), input = await intent(fixture.directory);
  const hook = join(fixture.root, 'hooks/pre-commit');
  await writeFile(hook, '#!/bin/sh\necho secret-hook-output >&2\nexit 1\n'); await chmod(hook, 0o700);
  await assert.rejects(submitLocalCommit(fixture.directory, input, () => {}), problem => problem instanceof Error && /钩子/.test(problem.message) && !problem.message.includes('secret-hook-output'));
  assert.ok(before.equals(await readFile(indexPath)));
  assert.equal((await fixture.git(fixture.directory, ['rev-parse', 'HEAD'])).stdout.trim(), input.expectedHead);
  assert.ok(!(await readdir(join(fixture.directory, '.git'))).some(name => /index\.lock|gittogether-commit-/.test(name)));
  await rm(hook); await fixture.git(fixture.directory, ['config', 'commit.gpgsign', 'true']); await fixture.git(fixture.directory, ['config', 'gpg.program', '/usr/bin/false']);
  await assert.rejects(submitLocalCommit(fixture.directory, input, () => {}), /签名失败/);
  assert.ok(before.equals(await readFile(indexPath)));
});

test('stale file snapshots, foreign tasks and another index lock reject before writing', async t => {
  const fixture = await createRepositoryFixture(); t.after(fixture.cleanup); await prepare(fixture);
  const input = await intent(fixture.directory), index = await readFile(join(fixture.directory, '.git/index'));
  await writeFile(join(fixture.directory, 'src/another.ts'), 'Another save\n');
  await assert.rejects(submitLocalCommit(fixture.directory, input, () => {}), /已变化/);
  await assert.rejects(submitLocalCommit(fixture.directory, { ...input, taskId: `worktree:main:/outside` }, () => {}), /不可用/);
  await writeFile(join(fixture.directory, '.git/index.lock'), 'other-operation');
  await assert.rejects(submitLocalCommit(fixture.directory, await intent(fixture.directory), () => {}), /另一个 Git 操作/);
  assert.equal(await readFile(join(fixture.directory, '.git/index.lock'), 'utf8'), 'other-operation');
  assert.ok(index.equals(await readFile(join(fixture.directory, '.git/index'))));
});

test('first commit works with an unborn branch; existing Git merge state is left for its owner', async t => {
  const fixture = await createRepositoryFixture(); t.after(fixture.cleanup);
  const root = join(fixture.root, 'unborn'); await mkdir(root);
  await fixture.git(root, ['init', '-b', 'first']); await fixture.git(root, ['config', 'user.name', 'QA']); await fixture.git(root, ['config', 'user.email', 'qa@example.test']);
  await fixture.git(root, ['config', 'commit.gpgsign', 'false']); await fixture.git(root, ['config', 'core.hooksPath', join(fixture.root, 'hooks')]);
  await writeFile(join(root, 'first.txt'), 'First commit\n');
  const result = await submitLocalCommit(root, await intent(root), () => {}); assert.equal(result.branch, 'first');
  assert.equal((await fixture.git(root, ['status', '--porcelain'])).stdout, '');
  await writeFile(join(fixture.directory, '.git/MERGE_HEAD'), 'a'.repeat(40));
  await assert.rejects(submitLocalCommit(fixture.directory, await intent(fixture.directory), () => {}), /先完成/);
});

test('actual HTTP/client/service commit is account-bound, idempotent and refreshes real history', async t => {
  const fixture = await createRemoteServiceFixture('gitea'); t.after(fixture.cleanup); await prepare(fixture);
  await fixture.git(fixture.directory, ['remote', 'add', 'origin', 'https://git.fixture.test/qa/project.git']);
  await fixture.service.handle('link', { repositoryId: fixture.repositoryId, path: fixture.directory });
  const server = createServer((req, res) => { void importMiddleware(fixture.service)(req, res, () => { res.statusCode = 404; res.end(); }); });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done)); t.after(() => new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done())));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const transport = globalThis.fetch; t.mock.method(globalThis, 'fetch', (path: string | URL | Request, init?: RequestInit) => transport(new URL(String(path), `http://127.0.0.1:${address.port}`), init));
  const input = await intent(fixture.directory, fixture.repositoryId);
  await assert.rejects(importAPI('submitCommit', { ...input, path: '/outside' } as LocalSubmitInput), /仅接受/);
  const result = await importAPI('submitCommit', input);
  assert.deepEqual(await importAPI('submitCommit', input), result);
  await assert.rejects(importAPI('submitCommit', { ...input, summary: 'Changed request' }), /标识已被使用/);
  const workspace = await importAPI('localWorkspace', { repositoryId: fixture.repositoryId });
  assert.equal(workspace.tasks.find(task => task.id === input.taskId)?.files.length, 0); assert.equal(workspace.commits[0].id, result.commitId);
  await fixture.service.handle('unlink', { repositoryId: fixture.repositoryId });
  await assert.rejects(importAPI('submitCommit', { ...input, operationId: randomUUID() }), /先关联/);
});

test('AI receives bounded evidence only, skips symlinks/binary contents, leaves Git untouched and rejects stale completion', async t => {
  const fixture = await createRepositoryFixture(); t.after(fixture.cleanup); await prepare(fixture);
  await writeFile(join(fixture.directory, 'binary.dat'), Buffer.from([0, 1, 2])); await symlink('/etc/hosts', join(fixture.directory, 'outside-link'));
  const input = await intent(fixture.directory), index = await readFile(join(fixture.directory, '.git/index'));
  const draft = await generateCommitDraft(fixture.directory, input, () => {}, undefined, async context => {
    const value = JSON.parse(context); assert.match(value.patch, /value = 10/); assert.doesNotMatch(value.patch, /value = 20/);
    assert.ok(value.untracked.find((file: { path: string; note?: string }) => file.path === 'outside-link')?.note);
    assert.ok(value.untracked.find((file: { path: string; note?: string }) => file.path === 'binary.dat')?.note);
    return { summary: '更新主分支实现', description: '根据真实更改生成' };
  });
  assert.equal(draft.summary, '更新主分支实现'); assert.ok(index.equals(await readFile(join(fixture.directory, '.git/index'))));
  await assert.rejects(generateCommitDraft(fixture.directory, input, () => {}, undefined, async () => {
    await writeFile(join(fixture.directory, 'src/app.ts'), 'Changed during generation\n'); return draft;
  }), /已变化/);
  assert.equal((await fixture.git(fixture.directory, ['rev-parse', 'HEAD'])).stdout.trim(), input.expectedHead);
});

test('native-style generation cancellation is scoped to the exact request and releases the worktree', async t => {
  let entered!: () => void;
  const started = new Promise<void>(done => { entered = done; });
  const fixture = await createRemoteServiceFixture('gitea', { commitGenerator: async (_context, signal) => {
    entered(); return new Promise((_accept, reject) => { signal!.addEventListener('abort', () => reject(signal!.reason), { once: true }); });
  } }); t.after(fixture.cleanup); await prepare(fixture);
  await fixture.git(fixture.directory, ['remote', 'add', 'origin', 'https://git.fixture.test/qa/project.git']);
  await fixture.service.handle('link', { repositoryId: fixture.repositoryId, path: fixture.directory });
  const input = await intent(fixture.directory, fixture.repositoryId), generationId = randomUUID();
  const pending = fixture.service.handle('generateCommitMessage', { repositoryId: input.repositoryId, taskId: input.taskId, expectedHead: input.expectedHead, changeKey: input.changeKey, generationId });
  const rejected = assert.rejects(pending, /aborted/i);
  await started;
  assert.deepEqual(await fixture.service.handle('cancelCommitGeneration', { repositoryId: input.repositoryId, taskId: input.taskId, generationId: randomUUID() }), { cancelled: false });
  assert.deepEqual(await fixture.service.handle('cancelCommitGeneration', { repositoryId: input.repositoryId, taskId: input.taskId, generationId }), { cancelled: true });
  await rejected;
  assert.deepEqual(await fixture.service.handle('cancelCommitGeneration', { repositoryId: input.repositoryId, taskId: input.taskId, generationId }), { cancelled: false });
  assert.equal((await fixture.git(fixture.directory, ['rev-parse', 'HEAD'])).stdout.trim(), input.expectedHead);
});
