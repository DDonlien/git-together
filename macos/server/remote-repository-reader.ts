import type { Provider, RemoteRepository } from '../src/import-model';
import type { RepositoryCommit, RepositoryTask } from '../src/repository-model';
import { topologicalCommits } from '../src/repository-model';
import type { RemoteCommitDetails, RemoteCommitFile, RemoteFileContent, RemoteRepositoryWorkspace } from '../src/remote-repository-model';

// Only AccountService supplies this transport. Paths are built here, never taken
// from provider links or renderer URLs, so credentials cannot change hosts.
export type RemoteTransport = (path: string, format: 'json' | 'text', signal?: AbortSignal) => Promise<{ value: unknown; headers: Headers }>;
type Tree = { entries: Map<string, { sha: string; type: string }>; complete: boolean };
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const sha = (value: unknown): string => {
  if (typeof value !== 'string' || !/^[a-f0-9]{40,64}$/i.test(value)) throw new Error('远端返回了无效的 Git 对象标识。');
  return value;
};
const pathValue = (value: unknown): string => {
  if (typeof value !== 'string' || !value || value.length > 4096 || value.includes('\0') || value.startsWith('/') || value.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('远端返回了无效的文件路径。');
  return value;
};
function commitValue(value: unknown): RepositoryCommit {
  if (!record(value) || !record(value.commit) || typeof value.commit.message !== 'string' || !record(value.commit.author) || typeof value.commit.author.name !== 'string' || typeof value.commit.author.date !== 'string' || !Number.isFinite(Date.parse(value.commit.author.date)) || !Array.isArray(value.parents)) throw new Error('远端提交返回格式无效。');
  return { id: sha(value.sha), summary: value.commit.message.split('\n')[0], author: value.commit.author.name, time: value.commit.author.date,
    parents: value.parents.map(parent => sha(record(parent) ? parent.sha : null)), refs: [] };
}
function remember<T>(cache: Map<string, T>, key: string, value: T): T {
  // Cache immutable object IDs, not credentials; bounded to 64 snapshots.
  cache.set(key, value); if (cache.size > 64) cache.delete(cache.keys().next().value!); return value;
}
function diffPath(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    const bytes: number[] = [];
    const source = value.slice(1, -1);
    for (let index = 0; index < source.length;) {
      const escaped = /^\\([0-7]{1,3}|[\\"tnr])/.exec(source.slice(index));
      if (escaped) { bytes.push(/^[0-7]/.test(escaped[1]) ? parseInt(escaped[1], 8) : ({ t: 9, n: 10, r: 13, '\\': 92, '"': 34 }[escaped[1]]!)); index += escaped[0].length; }
      else { const point = source.codePointAt(index)!; bytes.push(...Buffer.from(String.fromCodePoint(point))); index += point > 65535 ? 2 : 1; }
    }
    value = Buffer.from(bytes).toString('utf8');
  }
  return value.startsWith('a/') || value.startsWith('b/') ? value.slice(2) : value;
}
export function attachDiffPatches(diff: string, files: RemoteCommitFile[]): RemoteCommitFile[] {
  const patches = new Map<string, string>();
  for (const section of diff.split(/(?=^diff --git )/m).filter(Boolean)) {
    const newPath = /^\+\+\+ (.+)$/m.exec(section)?.[1];
    const oldPath = /^--- (.+)$/m.exec(section)?.[1];
    const path = newPath && newPath !== '/dev/null' ? diffPath(newPath) : oldPath ? diffPath(oldPath) : '';
    if (path) patches.set(path, section.trimEnd());
  }
  return files.map(file => ({ ...file, patch: patches.get(file.path) ?? null }));
}

export class RemoteRepositoryReader {
  private base: string;
  private trees = new Map<string, Tree>();
  private histories = new Map<string, { commits: RepositoryCommit[]; tree: string; limited: boolean }>();
  constructor(private provider: Provider, repository: Pick<RemoteRepository, 'fullName' | 'defaultBranch'>, private request: RemoteTransport, private now = Date.now) {
    const parts = repository.fullName.split('/');
    if (parts.length !== 2 || parts.some(part => !part || part === '.' || part === '..' || /[\s\0]/.test(part))) throw new Error('无效的远端仓库身份。');
    this.base = `/repos/${parts.map(encodeURIComponent).join('/')}`;
    this.defaultBranch = repository.defaultBranch;
  }
  private defaultBranch: string;
  private endpoint(path: string, params: Record<string, string> = {}): string {
    const query = new URLSearchParams(params); return `${this.base}${path}${query.size ? `?${query}` : ''}`;
  }
  private async history(head: string, signal?: AbortSignal) {
    const cached = this.histories.get(head); if (cached) return cached;
    const { value } = await this.request(this.endpoint('/commits', { sha: head, [this.provider === 'github' ? 'per_page' : 'limit']: '50', page: '1', ...(this.provider === 'gitea' ? { stat: 'false' } : {}) }), 'json', signal);
    if (!Array.isArray(value) || !value.length) throw new Error('远端分支没有返回其 HEAD 提交。');
    const commits = value.map(commitValue);
    if (commits[0].id !== head || !record(value[0]) || !record(value[0].commit) || !record(value[0].commit.tree)) throw new Error('远端分支提交与 HEAD 不一致。');
    return remember(this.histories, head, { commits, tree: sha(value[0].commit.tree.sha), limited: value.length >= 50 });
  }
  private async tree(treeId: string, signal?: AbortSignal): Promise<Tree> {
    const cached = this.trees.get(treeId); if (cached) return cached;
    const entries: Tree['entries'] = new Map();
    let complete = true;
    // Gitea paginates recursive trees; GitHub signals truncation and requires
    // non-recursive traversal. Never mistake either for a complete empty tree.
    const insert = (value: unknown, prefix = '') => {
      if (!record(value) || !Array.isArray(value.tree)) throw new Error('远端文件树返回格式无效。');
      for (const item of value.tree) {
        if (!record(item) || !['tree', 'blob', 'commit'].includes(String(item.type))) throw new Error('远端文件树包含无效的条目。');
        const path = pathValue(prefix + pathValue(item.path));
        entries.set(path, { sha: sha(item.sha), type: String(item.type) });
        if (entries.size >= 20000) { complete = false; break; }
      }
      return value;
    };
    if (this.provider === 'gitea') {
      for (let page = 1; page <= 200; page++) {
        signal?.throwIfAborted();
        const result = await this.request(this.endpoint(`/git/trees/${sha(treeId)}`, { recursive: 'true', page: String(page), per_page: '100' }), 'json', signal);
        const value = insert(result.value);
        const total = typeof value.total_count === 'number' ? value.total_count : null;
        const more = value.truncated === true || (total !== null ? entries.size < total : /rel="?next"?/.test(result.headers.get('link') || ''));
        if (!complete || !more) { complete = complete && value.truncated !== true; break; }
        if (page === 200) complete = false;
      }
    } else {
      const first = insert((await this.request(this.endpoint(`/git/trees/${sha(treeId)}`, { recursive: '1' }), 'json', signal)).value);
      if (first.truncated === true) {
        entries.clear(); complete = true;
        const queue = [{ id: treeId, prefix: '' }];
        for (let requests = 0; queue.length && complete; requests++) {
          if (requests >= 400) { complete = false; break; }
          const next = queue.shift()!;
          const result = insert((await this.request(this.endpoint(`/git/trees/${sha(next.id)}`), 'json', signal)).value, next.prefix);
          if (result.truncated === true) { complete = false; break; }
          if (Array.isArray(result.tree)) for (const item of result.tree) if (record(item) && item.type === 'tree') queue.push({ id: sha(item.sha), prefix: next.prefix + pathValue(item.path) + '/' });
        }
      }
    }
    return remember(this.trees, treeId, { entries, complete });
  }
  async workspace(signal?: AbortSignal): Promise<RemoteRepositoryWorkspace> {
    const branches = new Map<string, string>(); const warnings: string[] = [];
    for (let page = 1; page <= 10; page++) {
      signal?.throwIfAborted();
      const { value, headers } = await this.request(this.endpoint('/branches', { page: String(page), [this.provider === 'github' ? 'per_page' : 'limit']: '100' }), 'json', signal);
      if (!Array.isArray(value)) throw new Error('远端分支返回格式无效。');
      for (const branch of value) {
        if (!record(branch) || typeof branch.name !== 'string' || !branch.name || /[\0\r\n]/.test(branch.name) || !record(branch.commit)) throw new Error('远端分支返回格式无效。');
        branches.set(branch.name, sha(this.provider === 'github' ? branch.commit.sha : branch.commit.id));
      }
      const total = Number(headers.get('x-total-count'));
      const more = /rel="?next"?/.test(headers.get('link') || '') || total > branches.size || value.length >= 100;
      if (!more || !value.length) break;
      if (page === 10) warnings.push('分支超过单次读取上限（1000 个）；当前仅显示已读取的分支。');
    }
    const items = [...branches].sort(([a], [b]) => Number(b === this.defaultBranch) - Number(a === this.defaultBranch) || a.localeCompare(b));
    const tasks: RepositoryTask[] = []; const commits = new Map<string, RepositoryCommit>();
    let cursor = 0;
    let limited = false;
    await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
      while (cursor < items.length) {
        const [branch, head] = items[cursor++]; signal?.throwIfAborted();
        const task: RepositoryTask = { id: `remote:${branch}`, branch, head, path: null, files: [], tree: [], error: '', remote: true, treeComplete: false };
        tasks.push(task);
        try {
          const history = await this.history(head, signal); limited ||= history.limited;
          for (const commit of history.commits) if (!commits.has(commit.id)) commits.set(commit.id, { ...commit, refs: [] });
          const tree = await this.tree(history.tree, signal);
          task.tree = [...tree.entries].filter(([, item]) => item.type !== 'tree').map(([path]) => path); task.treeComplete = tree.complete;
          if (!tree.complete) warnings.push(`${branch} 的文件树达到接口/读取上限，当前只显示已读取部分。`);
        } catch (problem) {
          signal?.throwIfAborted(); task.error = problem instanceof Error ? problem.message : '读取远端分支失败。';
        }
      }
    }));
    for (const [branch, head] of branches) commits.get(head)?.refs.push(`origin/${branch}`);
    if (limited) warnings.push('每个分支当前读取最近 50 条提交；图线只使用真实父节点，不代表全部历史。');
    const order = new Map(items.map(([branch], index) => [branch, index])); tasks.sort((a, b) => order.get(a.branch)! - order.get(b.branch)!);
    return { source: 'remote', checkedAt: this.now(), tasks, commits: topologicalCommits([...commits.values()]), complete: !tasks.some(task => task.error) && tasks.every(task => task.treeComplete) && !warnings.some(warning => warning.startsWith('分支超过')), warnings };
  }
  async commit(commitId: string, signal?: AbortSignal): Promise<RemoteCommitDetails> {
    sha(commitId);
    const files: RemoteCommitFile[] = []; let commit: RepositoryCommit | undefined; let treeId = ''; const warnings: string[] = [];
    for (let page = 1; page <= 30; page++) {
      const { value, headers } = await this.request(this.endpoint(`${this.provider === 'gitea' ? '/git' : ''}/commits/${commitId}`, { ...(this.provider === 'github' ? { per_page: '100', page: String(page) } : { files: 'true' }) }), 'json', signal);
      const current = commitValue(value);
      if (current.id !== commitId || !record(value) || !Array.isArray(value.files)) throw new Error('远端提交文件返回格式无效。');
      commit = current;
      if (!record(value.commit) || !record(value.commit.tree)) throw new Error('远端提交树返回格式无效。');
      treeId = sha(value.commit.tree.sha);
      for (const file of value.files) {
        if (!record(file) || typeof file.status !== 'string') throw new Error('远端提交文件返回格式无效。');
        files.push({ path: pathValue(file.filename), status: file.status, ...(typeof file.previous_filename === 'string' ? { previousPath: pathValue(file.previous_filename) } : {}), patch: typeof file.patch === 'string' ? file.patch : null });
      }
      const more = this.provider === 'github' && /rel="?next"?/.test(headers.get('link') || '');
      if (!more) break;
      if (page === 30) warnings.push('提交文件超过接口上限（3000 个），当前文件列表不完整。');
    }
    const tree = await this.tree(treeId, signal);
    const paths = [...tree.entries].filter(([, entry]) => entry.type !== 'tree').map(([path]) => path);
    if (!tree.complete) warnings.push('所选提交的文件树不完整，当前显示已读取部分。');
    if (this.provider === 'gitea') {
      const result = await this.request(this.endpoint(`/git/commits/${commitId}.diff`), 'text', signal);
      if (typeof result.value !== 'string') throw new Error('远端 Diff 返回格式无效。');
      return { commit: commit!, files: attachDiffPatches(result.value, files), diff: result.value, tree: paths, treeComplete: tree.complete, warnings };
    }
    return { commit: commit!, files, diff: files.map(file => file.patch === null ? `# ${file.path}: 接口未提供文本补丁（二进制或补丁省略）` : `--- a/${file.previousPath || file.path}\n+++ b/${file.path}\n${file.patch}`).join('\n'), tree: paths, treeComplete: tree.complete, warnings };
  }
  async file(commitId: string, path: string, signal?: AbortSignal): Promise<RemoteFileContent> {
    sha(commitId); pathValue(path);
    const value = (await this.request(this.endpoint(`/git/commits/${commitId}`), 'json', signal)).value;
    const commitTree = record(value) && this.provider === 'gitea' && record(value.commit) ? value.commit.tree : record(value) ? value.tree : null;
    if (!record(commitTree)) throw new Error('远端提交树返回格式无效。');
    const tree = await this.tree(sha(commitTree.sha), signal);
    const entry = tree.entries.get(path);
    if (!entry) throw new Error(tree.complete ? '这个文件不在所选提交的文件树中。' : '文件树读取不完整，尚不能确认这个文件。');
    if (entry.type === 'commit') return { text: '这是子模块引用，不读取其他仓库内容。', binary: false, size: 0 };
    if (entry.type !== 'blob') throw new Error('只能读取文件，不读取目录。');
    const blob = (await this.request(this.endpoint(`/git/blobs/${entry.sha}`), 'json', signal)).value;
    if (!record(blob) || blob.encoding !== 'base64' || typeof blob.content !== 'string' || typeof blob.size !== 'number' || !Number.isSafeInteger(blob.size) || blob.size < 0) throw new Error('远端文件返回格式无效。');
    if (blob.size > 500000 || blob.content.length > 700000) return { text: '文件超过文本预览上限（500 KB）。', binary: false, size: blob.size };
    const content = Buffer.from(blob.content.replace(/\s/g, ''), 'base64');
    if (content.length !== blob.size) throw new Error('远端文件长度不一致。');
    const binary = content.includes(0);
    let text: string;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(content); } catch { return { text: '二进制或非 UTF-8 文件，不作为文本预览。', binary: true, size: blob.size }; }
    return { text: binary ? '二进制文件，不作为文本预览。' : text, binary, size: blob.size };
  }
}
