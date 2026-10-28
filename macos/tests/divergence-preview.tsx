import { createRoot } from 'react-dom/client';
import { MaterialProvider } from '../src/ui';
import { RepositoryActionDraftsProvider } from '../src/RepositoryActionDialog';
import { RepositoryOperationDialog } from '../src/RepositoryOperationDialog';
import { RepositoryOperationError } from '../src/import-api';
import type { RepositoryTask } from '../src/repository-model';
import type { RepositoryActionMode } from '../src/repository-action-model';
import 'open-glass-ui/styles.css';
import '../src/styles.css';
import '../src/divergence.css';

const query = new URLSearchParams(location.search);
const mode = (query.get('mode') || 'pull') as RepositoryActionMode;
const scenario = query.get('case') || 'diverged';
const sha = (character: string) => character.repeat(40);
const task: RepositoryTask = { id: 'worktree:main:/tmp/fixture/work', path: '/tmp/fixture/work', branch: 'main', head: sha('a'), changeKey: 'b'.repeat(64), files: [{ path: 'example.txt', status: 'M', tracked: true }], tree: ['example.txt'], error: '' };
const target = { repositoryId: 'fixture', repositoryName: 'fixture/project', task, draft: { summary: '示例提交', description: '' } };
const info = { diverged: true, repositoryId: 'fixture', taskId: task.id, path: task.path, branch: task.branch, head: task.head, changeKey: task.changeKey, dirty: scenario === 'dirty', remote: 'origin', pushRemote: mode === 'push' || mode === 'submit' ? 'origin' : null, remoteHead: sha('c'), ahead: 1, behind: 2, bases: [sha('d')], localCommits: [sha('a')], commitsTruncated: false };
Object.defineProperty(window, 'gittogether', { configurable: true, value: { import: async (method: string, input: Record<string, unknown>) => {
  if (method === 'prepareSync') return { ok: false, error: '本地与远端历史已分叉，请先合并或变基；Pull 没有修改文件。', reason: 'diverged' };
  if (method === 'inspectDivergence') return { ok: true, value: scenario === 'ahead' ? { diverged: false } : info };
  if (method === 'integrationBranches') return { ok: true, value: { branches: [{ name: 'main', head: sha('c') }, { name: 'release', head: sha('f') }], limited: false, remote: 'origin', pushRemote: 'origin', pushError: null } };
  if (method === 'integrationCommits') return { ok: true, value: { branch: input.remoteBranch, head: input.remoteHead, localHead: task.head, page: input.page, commits: [{ id: input.remoteHead, summary: '远端最新提交' }, { id: sha('d'), summary: '共同祖先' }], hasMore: false, bases: [sha('d')], ahead: 1, behind: 2 } };
  if (method === 'prepareIntegration') {
    if (scenario === 'ai-unavailable') return { ok: false, error: 'AI 不可用；目标分支未修改。' };
    if (scenario === 'stale') return { ok: false, error: '远端分支已变化，请重新核验分叉。' };
    return { ok: true, value: { id: 'integration-plan', repositoryId: 'fixture', taskId: task.id, mode: input.mode, path: task.path, branch: 'main', head: task.head, remote: 'origin', pushRemote: input.mode === 'remote-merge' ? 'origin' : null, remoteBranch: input.remoteBranch, remoteHead: input.remoteHead, targetCommit: input.targetCommit, base: sha('d'), replay: [{ id: sha('a'), summary: '本地修改' }], resultHead: sha('e'), files: [{ path: 'example.txt', status: 'M', tracked: true }], patch: 'diff --git a/example.txt b/example.txt\n--- a/example.txt\n+++ b/example.txt\n@@ -1 +1 @@\n-old\n+new\n', resolvedConflicts: ['example.txt'], summary: '合并远端更改', description: '', unchanged: false } };
  }
  if (method === 'applyIntegration') return { ok: true, value: input.acknowledgeRewrite ? { status: 'rebased', taskId: task.id, head: sha('e'), branch: 'main', recoveryRef: 'refs/gittogether/recovery/fixture' } : { status: 'pushed', taskId: task.id, head: task.head, branch: 'main', remoteBranch: 'release', commitId: sha('e'), recoveryRef: 'refs/gittogether/recovery/fixture' } };
  if (method === 'restoreIntegration') return { ok: true, value: { status: 'restored', taskId: task.id, head: task.head, branch: 'main', recoveryRef: 'refs/gittogether/recovery/fixture-rebased' } };
  if (method === 'discardIntegration') return { ok: true, value: { discarded: true } };
  if (method === 'prepareGraphMerge') {
    if (scenario === 'ai-unavailable') return { ok: false, error: 'AI 不可用；目标分支未修改。' };
    if (scenario === 'stale') return { ok: false, error: '远端分支已变化，请重新核验分叉。' };
    return { ok: true, value: { id: 'fixture-plan', repositoryId: 'fixture', taskId: task.id, head: task.head, branch: task.branch, path: task.path, sources: [{ kind: 'remote', name: 'main', taskId: '', head: sha('c'), included: true }], files: [{ path: 'example.txt', status: 'M', tracked: true }], patch: 'diff --git a/example.txt b/example.txt\n--- a/example.txt\n+++ b/example.txt\n@@ -1 +1 @@\n-old\n+new\n', localChanges: [], resolvedConflicts: ['example.txt'], summary: '合并远端更改', description: '', unchanged: false } };
  }
  if (method === 'applyGraphMerge') return scenario === 'uncertain' ? { ok: false, error: '连接中断。' } : { ok: true, value: { taskId: task.id, head: sha('e'), branch: task.branch, unchanged: false } };
  if (method === 'discardGraphMerge') return { ok: true, value: { discarded: true } };
  if (method === 'cancelGraphPreparation') return { ok: true, value: { cancelled: true } };
  if (method === 'localWorkspace') return { ok: true, value: { source: 'local', complete: true, tasks: [task], commits: [] } };
  throw new Error(`Unexpected fixture call: ${method}`);
} } });
const onCommit = async () => ({ taskId: task.id, branch: 'main', commitId: sha('a') });
const onPush = async () => { throw new RepositoryOperationError('远端已有新的提交，请先检查远端状态；未强制推送。', 'non-fast-forward'); };
const onGenerate = async () => ({ summary: '示例提交', description: '' });
const root = createRoot(document.getElementById('root')!);
root.render(<MaterialProvider appearance="light"><RepositoryActionDraftsProvider sessionId="fixture"><RepositoryOperationDialog mode={mode} targets={[target]} onCommit={onCommit} onPush={onPush} onGenerate={onGenerate} onClose={() => {}} /></RepositoryActionDraftsProvider></MaterialProvider>);
