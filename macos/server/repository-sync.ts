import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, cp, lstat, mkdir, mkdtemp, open, readFile, readdir, readlink, realpath, rename, rm, rmdir } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { RepositorySyncMode, RepositorySyncPlan, RepositorySyncResult, SyncFile } from '../src/repository-sync-model';
import { readWorktrees } from './repository-reader';
import { runGitProcess } from './git-process';
import { fetchRepositoryBranches, hydrateRepositoryLFS, networkFailure, type RepositoryNetwork } from './repository-network';

type Entry = { digest: string; mode: number; kind: 'file' | 'symlink' };
type Inventory = Map<string, Entry>;
export type SavedSyncPlan = {
  public: RepositorySyncPlan; root: string; temporary: string; snapshot?: string;
  inventory: Inventory; state: string; common: string; linked: boolean; reclaimStore: boolean;
};
const exists = async (path: string) => { try { await lstat(path); return true; } catch (p) { if ((p as NodeJS.ErrnoException).code === 'ENOENT') return false; throw p; } };
const git = (root: string, args: string[]) => runGitProcess(root, args);
async function digest(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
async function inventory(root: string, signal?: AbortSignal): Promise<Inventory> {
  const entries: Inventory = new Map();
  async function visit(directory: string, prefix: string) {
    signal?.throwIfAborted();
    const children = await readdir(directory, { withFileTypes: true });
    // Nested repositories (including submodules) are independent user data.
    if (prefix && children.some(child => child.name.toLowerCase() === '.git')) throw new Error(`目录 ${prefix} 包含独立 Git 仓库，已保留；请先移出此目录再清理。`);
    for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!prefix && child.name.toLowerCase() === '.git') continue;
      const path = join(directory, child.name), key = prefix ? `${prefix}/${child.name}` : child.name;
      const stat = await lstat(path);
      if (stat.isDirectory()) await visit(path, key);
      else if (stat.isSymbolicLink()) entries.set(key, { kind: 'symlink', mode: 0, digest: createHash('sha256').update(await readlink(path)).digest('hex') });
      else if (stat.isFile()) entries.set(key, { kind: 'file', mode: stat.mode & 0o111 ? 0o755 : 0o644, digest: await digest(path) });
      else throw new Error(`文件 ${key} 类型不支持，未修改工作目录。`);
      if (entries.size > 500_000) throw new Error('文件数量超过可预览范围，未修改工作目录。');
    }
  }
  await visit(root, ''); return entries;
}
const inventoryKey = (value: Inventory) => createHash('sha256').update(JSON.stringify([...value])).digest('hex');
function fileChanges(local: Inventory, remote: Inventory): SyncFile[] {
  return [...new Set([...local.keys(), ...remote.keys()])].sort().flatMap(path => {
    const before = local.get(path), after = remote.get(path);
    return JSON.stringify(before) === JSON.stringify(after) ? [] : [{ path, action: !after ? 'delete' as const : !before ? 'add' as const : 'restore' as const }];
  });
}
async function commonDirectory(root: string) { const path = (await git(root, ['rev-parse', '--git-common-dir'])).trim(); return realpath(resolve(root, path)); }
async function stateKey(root: string, files: Inventory) {
  const index = resolve(root, (await git(root, ['rev-parse', '--git-path', 'index'])).trim());
  const [head, refs, trees, indexHash] = await Promise.all([
    git(root, ['rev-parse', 'HEAD']), git(root, ['show-ref']).catch(p => { if ((p as { code?: number }).code === 1) return ''; throw p; }),
    git(root, ['worktree', 'list', '--porcelain', '-z']), digest(index).catch(p => { if ((p as NodeJS.ErrnoException).code === 'ENOENT') return ''; throw p; }),
  ]);
  return createHash('sha256').update(JSON.stringify([head, refs, trees, indexHash, inventoryKey(files)])).digest('hex');
}
async function assertIdle(root: string) {
  for (const name of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply', 'BISECT_START']) {
    if (await exists(resolve(root, (await git(root, ['rev-parse', '--git-path', name])).trim()))) throw new Error('工作目录有未完成的合并、变基或其他 Git 操作，请先完成后重试。');
  }
}
async function copyCommitSettings(root: string, snapshot: string) {
  // Copy only local identity/signing and checkout settings; never old remotes,
  // credentials, alternate object stores, worktree layout or LFS storage paths.
  const keys = ['user.name', 'user.email', 'user.signingkey', 'commit.gpgsign', 'gpg.format', 'gpg.program', 'gpg.ssh.program', 'core.hooksPath', 'core.autocrlf', 'core.eol', 'core.filemode'];
  for (const key of keys) {
    const value = await git(root, ['config', '--local', '--get', key]).catch(p => { if ((p as { code?: number }).code === 1) return ''; throw p; });
    if (value) await git(snapshot, ['config', key, value.trimEnd()]);
  }
  const hooks = resolve(root, (await git(root, ['rev-parse', '--git-path', 'hooks'])).trim());
  if (await exists(hooks)) await cp(hooks, join(snapshot, '.git', 'hooks'), { recursive: true });
}
async function createSnapshot(root: string, destination: string, branch: string, network: RepositoryNetwork, validate: () => void, signal?: AbortSignal) {
  await mkdir(destination, { mode: 0o700 });
  await network.git(destination, ['init', '--quiet', '--template='], signal);
  await network.git(destination, ['remote', 'add', 'origin', network.url], signal);
  validate();
  await network.git(destination, ['fetch', '--depth=1', '--no-tags', '--no-auto-gc', '--recurse-submodules=no', 'origin', `+refs/heads/${branch}:refs/remotes/origin/${branch}`], signal);
  const head = (await git(destination, ['rev-parse', `refs/remotes/origin/${branch}^{commit}`])).trim();
  const tree = await git(destination, ['ls-tree', '-r', head]);
  if (/^160000 /m.test(tree)) throw new Error('此分支包含子模块；子模块目录已保留，暂不支持快照替换。');
  await copyCommitSettings(root, destination);
  await network.git(destination, ['checkout', '--quiet', '-b', branch, '--track', `refs/remotes/origin/${branch}`], signal);
  const files = await git(destination, ['ls-files', '-z']);
  const attributes = (await runGitProcess(destination, ['check-attr', '-z', '--stdin', 'filter'], { stdin: files })).split('\0');
  if (attributes.some((v, i) => i % 3 === 2 && v === 'lfs')) {
    await network.git(destination, ['lfs', 'version'], signal);
    await network.git(destination, ['lfs', 'pull', '-I', '', '-X', '', 'origin'], signal);
    await network.git(destination, ['lfs', 'fsck', '--objects', head], signal);
  }
  await git(destination, ['fsck', '--connectivity-only', '--no-dangling']);
  validate(); signal?.throwIfAborted();
  if ((await git(destination, ['rev-parse', 'HEAD'])).trim() !== head || (await git(destination, ['rev-list', '--count', 'HEAD'])).trim() !== '1') throw new Error('最新快照校验失败，未修改原目录。');
  return head;
}
export async function prepareRepositorySync(root: string, input: { repositoryId: string; taskId: string; mode: RepositorySyncMode }, network: RepositoryNetwork, storageRoot: string, validate: () => void, signal?: AbortSignal): Promise<SavedSyncPlan> {
  let temporary = '';
  try {
    validate(); signal?.throwIfAborted(); await assertIdle(root);
    const trees = await readWorktrees(root), worktree = trees.find(t => t.path === root);
    if (!worktree || worktree.branch === 'Detached HEAD' || `worktree:${worktree.branch}:${worktree.path}` !== input.taskId) throw new Error('工作目录分支已变化，请刷新后重试。');
    const branch = worktree.branch;
    await git(root, ['check-ref-format', '--branch', branch]);
    const common = await commonDirectory(root);
    const linked = !(await lstat(join(root, '.git'))).isDirectory();
    let reclaimStore = false, protectedHistory = false;
    if (input.mode === 'latest') {
      if ((await git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])).length) throw new Error('Get Latest 需要先处理未提交文件；请先 Commit、Submit 或通过 Clean 预览并恢复文件。');
      const refs = (await git(root, ['for-each-ref', '--format=%(refname)%00%(symref)'])).trim().split('\n').filter(Boolean).map(line => line.split('\0'));
      const otherRefs = refs.filter(([ref, symref]) => ref !== `refs/heads/${branch}` && !(ref.startsWith('refs/remotes/') && (ref.endsWith(`/${branch}`) || symref?.endsWith(`/${branch}`))));
      const otherTrees = trees.filter(t => !t.bare && t.path !== root);
      if (!linked && (otherTrees.length || otherRefs.length)) throw new Error('此主目录还保存其他分支、标签或工作目录的历史，已保留；请在独立分支工作目录使用 Get Latest。');
      const owned = relative(resolve(storageRoot), common);
      reclaimStore = linked && !otherTrees.length && !otherRefs.length && /^[a-f0-9]{64}\.git$/.test(owned) && !isAbsolute(owned) && (await git(common, ['rev-parse', '--is-bare-repository'])).trim() === 'true';
      protectedHistory = linked && !reclaimStore;
    }
    temporary = await mkdtemp(join(dirname(root), '.gittogether-sync-')); await chmod(temporary, 0o700);
    let snapshot: string | undefined, remoteHead: string, files: SyncFile[];
    if (input.mode === 'pull') {
      const fetched = await fetchRepositoryBranches(root, [branch], network, validate, signal); remoteHead = fetched[0].head;
      if ((await git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])).length) throw new Error('Pull 前请先 Commit 或 Submit 未提交文件。');
      const behind = await git(root, ['merge-base', '--is-ancestor', worktree.head, remoteHead]).then(() => true, p => { if ((p as { code?: number }).code === 1) return false; throw p; });
      const ahead = await git(root, ['merge-base', '--is-ancestor', remoteHead, worktree.head]).then(() => true, p => { if ((p as { code?: number }).code === 1) return false; throw p; });
      if (!behind && !ahead) throw new Error('本地与远端历史已分叉，请先在 Git 中合并或变基；Pull 没有修改本地文件。');
      const names = behind ? (await git(root, ['diff', '--name-status', '-z', '--no-renames', '--no-ext-diff', '--no-textconv', worktree.head, remoteHead])).split('\0') : [];
      files = []; for (let i = 0; i < names.length - 1; i += 2) files.push({ path: names[i + 1], action: names[i] === 'D' ? 'delete' : names[i] === 'A' ? 'add' : 'restore' });
    } else {
      snapshot = join(temporary, 'snapshot'); remoteHead = await createSnapshot(root, snapshot, branch, network, validate, signal);
      if (input.mode === 'latest') {
        const fetched = await fetchRepositoryBranches(root, [branch], network, validate, signal);
        if (fetched[0].head !== remoteHead) throw new Error('远端分支已更新，请重新预览最新快照。');
        const published = await git(root, ['merge-base', '--is-ancestor', worktree.head, remoteHead]).then(() => true, p => { if ((p as { code?: number }).code === 1) return false; throw p; });
        if (!published) throw new Error('本地还有未推送或分叉的提交，已保留历史；请先 Push 或处理历史后再使用 Get Latest。');
      }
      files = fileChanges(await inventory(root, signal), await inventory(snapshot, signal));
    }
    const local = await inventory(root, signal); validate();
    if ((await git(root, ['rev-parse', 'HEAD'])).trim() !== worktree.head || (await git(root, ['symbolic-ref', '--short', 'HEAD'])).trim() !== branch) throw new Error('分支或提交已变化，请重新预览。');
    return { root, temporary, snapshot, inventory: local, state: await stateKey(root, local), common, linked, reclaimStore,
      public: { ...input, id: randomUUID(), path: root, branch, head: worktree.head, remoteHead, files,
        historyCommits: input.mode === 'latest' ? Math.max(0, Number((await git(root, ['rev-list', '--count', 'HEAD'])).trim()) - 1) : 0,
        protectedHistory, note: input.mode === 'pull' ? '仅快进合入；未提交文件或分叉历史会停止操作。' : input.mode === 'clean' ? '以远端为准恢复、补齐和删除文件（包含忽略的本地文件）；本地提交和暂存区保留。' : protectedHistory ? '最新目录只保留一层历史；其他工作目录仍需要的共享历史和 LFS 缓存保留。' : '核验最新文件及 LFS 后，替换为一层历史并删除原目录的旧 Git 对象和历史缓存。' } };
  } catch (p) { if (temporary) await rm(temporary, { recursive: true, force: true }); throw networkFailure(p); }
}
async function removeEmptyParents(root: string, path: string) {
  let parent = dirname(join(root, path));
  while (parent !== root && parent.startsWith(root + '/')) { try { await rmdir(parent); } catch { break; } parent = dirname(parent); }
}
async function cleanFiles(plan: SavedSyncPlan) {
  const backup = join(plan.temporary, 'backup'); await mkdir(backup);
  const removed: string[] = [], written: string[] = [];
  try {
    // Remove changed leaves first so file/directory transitions are safe.
    for (const file of [...plan.public.files].sort((a, b) => b.path.length - a.path.length)) {
      if (!plan.inventory.has(file.path)) continue;
      const target = join(plan.root, file.path), saved = join(backup, file.path);
      await mkdir(dirname(saved), { recursive: true }); await rename(target, saved); removed.push(file.path); await removeEmptyParents(plan.root, file.path);
    }
    for (const file of plan.public.files) {
      if (file.action === 'delete') continue;
      const target = join(plan.root, file.path);
      if (await exists(target)) {
        // An empty old directory can become a file; never recursively remove
        // an unexpected path created by another writer after the preview.
        await rmdir(target);
      }
      await mkdir(dirname(target), { recursive: true });
      await rename(join(plan.snapshot!, file.path), target); written.push(file.path);
    }
  } catch (p) {
    try {
      for (const path of written.reverse()) { await rm(join(plan.root, path)); await removeEmptyParents(plan.root, path); }
      for (const path of removed.reverse()) { const target = join(plan.root, path); if (await exists(target)) await rmdir(target); await mkdir(dirname(target), { recursive: true }); await rename(join(backup, path), target); }
    } catch { throw new Error(`文件恢复未完成，原文件备份已保留在 ${backup}；请打开此目录检查。`); }
    throw p;
  }
}
async function directoryBytes(root: string): Promise<number> {
  if (!await exists(root)) return 0;
  let bytes = 0;
  for (const item of await readdir(root, { withFileTypes: true })) { const path = join(root, item.name), stat = await lstat(path); bytes += stat.isDirectory() ? await directoryBytes(path) : stat.size; }
  return bytes;
}
export async function applyRepositorySync(plan: SavedSyncPlan, network: RepositoryNetwork, validate: () => void, signal?: AbortSignal): Promise<RepositorySyncResult> {
  const { root, public: preview } = plan;
  let preserveTemporary = false;
  try {
    validate(); signal?.throwIfAborted(); await assertIdle(root);
    if (await stateKey(root, await inventory(root, signal)) !== plan.state) throw new Error('目录、暂存区、分支或历史已变化，请重新预览后再执行。');
    const remote = (await network.git(root, ['ls-remote', '--exit-code', network.url, `refs/heads/${preview.branch}`], signal, 120_000)).trim().split(/\s+/)[0];
    if (remote !== preview.remoteHead) throw new Error('远端分支已更新，请重新预览最新文件。');
    validate(); signal?.throwIfAborted();
    const result: RepositorySyncResult = { taskId: preview.taskId, mode: preview.mode, head: preview.head, files: preview.files.length, reclaimedBytes: 0, protectedHistory: preview.protectedHistory };
    // After a write begins, finish or roll back independently of an HTTP
    // disconnect. The service operation id makes retries idempotent.
    if (preview.mode === 'pull') {
      await network.git(root, ['merge', '--ff-only', '--no-edit', preview.remoteHead]);
      result.head = (await git(root, ['rev-parse', 'HEAD'])).trim();
      try { await hydrateRepositoryLFS(root, network, result.head); }
      catch { result.warning = 'Pull 已快进完成，但 LFS 文件下载未完成；请检查网络后再次 Pull 补齐 LFS 文件。'; }
    } else if (preview.mode === 'clean') {
      const lockPath = resolve(root, (await git(root, ['rev-parse', '--git-path', 'index.lock'])).trim());
      const lock = await open(lockPath, 'wx').catch(() => { throw new Error('Git 暂存区正在使用，请稍后重新预览。'); });
      try {
        if (await stateKey(root, await inventory(root)) !== plan.state) throw new Error('文件已经变化，请重新预览。');
        await cleanFiles(plan);
      } catch (p) { if (p instanceof Error && p.message.includes('备份已保留')) preserveTemporary = true; throw p; }
      finally { await lock.close(); await rm(lockPath); }
    } else {
      // A primary repository cannot be moved while another worktree relies on
      // its .git. That case is rejected during preview, before any deletion.
      const old = join(plan.temporary, 'old');
      const lockPath = resolve(root, (await git(root, ['rev-parse', '--git-path', 'index.lock'])).trim());
      const lock = await open(lockPath, 'wx').catch(() => { throw new Error('Git 暂存区正在使用，请稍后重新预览。'); });
      let moved = false;
      try {
      const oldBytes = await directoryBytes(plan.linked ? plan.reclaimStore ? plan.common : resolve(root, (await git(root, ['rev-parse', '--git-dir'])).trim()) : join(root, '.git'));
      if (await stateKey(root, await inventory(root)) !== plan.state) throw new Error('文件已经变化，请重新预览。');
      if (plan.linked) await network.git(plan.common, ['worktree', 'move', root, old]);
      else await rename(root, old);
      moved = true;
      preserveTemporary = true;
      try { await rename(plan.snapshot!, root); }
      catch (p) { if (plan.linked) await network.git(plan.common, ['worktree', 'move', old, root]); else await rename(old, root); moved = false; preserveTemporary = false; throw p; }
      result.head = preview.remoteHead;
      try {
        if (plan.linked) await network.git(plan.common, ['worktree', 'remove', '--force', old]);
        else await rm(old, { recursive: true });
        if (plan.reclaimStore) await rm(plan.common, { recursive: true });
        result.reclaimedBytes = preview.protectedHistory ? 0 : Math.max(0, oldBytes - await directoryBytes(join(root, '.git')));
        preserveTemporary = false;
      } catch {
        preserveTemporary = true;
        result.warning = `最新目录已就绪，旧历史清理未完成，已保留 ${plan.temporary}；请检查目录权限。`;
      }
      } finally { await lock.close(); await rm(plan.linked || !moved ? lockPath : join(old, '.git', 'index.lock'), { force: true }); }
    }
    return result;
  } catch (p) { throw networkFailure(p); }
  finally { if (!preserveTemporary) await rm(plan.temporary, { recursive: true, force: true }); }
}
export async function discardRepositorySync(plan: SavedSyncPlan) { await rm(plan.temporary, { recursive: true, force: true }); }
