import { lstat, readdir, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { LocalWorktreeLink } from '../src/import-model';
import { remoteIdentity } from './git-identity';
import { readLocalGit, readWorktrees } from './repository-reader';

// Stops at a checkout: its tracked folders are not candidate repositories.
// Bounds cover a normal project container, not an unbounded disk search.
export async function discoverLocalWorktrees(input: string, remoteURL: string, branch?: string, signal?: AbortSignal): Promise<{ path: string; worktrees: LocalWorktreeLink[] }> {
  signal?.throwIfAborted();
  const expanded = input === '~' ? homedir() : input.startsWith('~/') ? resolve(homedir(), input.slice(2)) : input;
  if (!expanded || !isAbsolute(expanded)) throw new Error('请选择绝对本地目录。');
  const root = await realpath(expanded);
  if (!(await lstat(root)).isDirectory()) throw new Error('请选择文件夹，而不是文件。');
  const expected = remoteIdentity(remoteURL);
  if (!expected) throw new Error('仓库远端地址无效。');
  const worktrees: LocalWorktreeLink[] = [];
  const pending = [{ path: root, depth: 0 }];
  let visited = 0;
  while (pending.length) {
    signal?.throwIfAborted();
    const next = pending.shift()!;
    if (++visited > 4000 || next.depth > 8) throw new Error('目录扫描超过4000个文件夹或8层；请选择更具体的项目目录，尚未保存关联。');
    const entries = await readdir(next.path, { withFileTypes: true });
    const marker = entries.find(entry => entry.name === '.git');
    if (marker && !marker.isSymbolicLink()) {
      const names = (await readLocalGit(next.path, ['remote'])).trim().split('\n').filter(Boolean);
      const remotes = await Promise.all(names.map(name => readLocalGit(next.path, ['remote', 'get-url', name])));
      if (remotes.some(remote => remoteIdentity(remote.trim()) === expected)) {
        // Registered nested worktrees can sit below the checkout we stop at.
        // Never associate registered siblings outside the user's chosen scope.
        for (const task of await readWorktrees(next.path)) {
          signal?.throwIfAborted();
          const subpath = relative(root, task.path);
          if (task.bare || task.prunable || subpath === '..' || subpath.startsWith(`..${sep}`) || isAbsolute(subpath)) continue;
          if (branch !== undefined && task.branch !== branch) continue;
          let path = root; let symlink = false;
          for (const part of subpath.split(sep).filter(Boolean)) { path = join(path, part); if ((await lstat(path)).isSymbolicLink()) { symlink = true; break; } }
          if (symlink || worktrees.some(item => item.path === task.path)) continue;
          const taskNames = (await readLocalGit(task.path, ['remote'])).trim().split('\n').filter(Boolean);
          const taskRemotes = await Promise.all(taskNames.map(name => readLocalGit(task.path, ['remote', 'get-url', name])));
          if (!taskRemotes.some(remote => remoteIdentity(remote.trim()) === expected)) continue;
          worktrees.push({ branch: task.branch, path: task.path });
          if (worktrees.length > 64) throw new Error('匹配工作目录超过64个，请选择更具体的项目目录，尚未保存关联。');
        }
      }
      continue;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || ['.git', 'node_modules', '.cache', '_builds'].includes(entry.name)) continue;
      pending.push({ path: join(next.path, entry.name), depth: next.depth + 1 });
    }
  }
  if (!worktrees.length) throw new Error(branch === undefined ? '这个目录及子目录的远端不是目标仓库，没有保存关联。' : `未找到真实检出分支 ${branch} 的匹配工作目录，没有保存关联。`);
  signal?.throwIfAborted();
  return { path: root, worktrees };
}
