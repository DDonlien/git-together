import { useMemo, useState, type RefObject } from 'react';
import { generateCommitMessage as generateWithService, importAPI } from './import-api';
import { type Account, type LocalLink, type RemoteRepository } from './import-model';
import { Button, Icon, Notice, Segmented } from './ui';
import { SearchBar } from './material-inputs';
import { RepositoryRowActions } from './RepositoryActions';
import { DashboardActionNames } from './DashboardActionNames';
import { RepositoryOperationDialog } from './RepositoryOperationDialog';
import type { RepositoryActionMode, RepositoryActionTarget } from './repository-action-model';
import { repositoryActionTargets } from './repository-action-model';
import { gitSignals, hiddenEntryKey, linkedTasks } from './branch-links';
import { RepositoryGraph } from './RepositoryGraph';
import { RepositoryColumnHeading } from './RepositoryColumnHeading';
import { RepositoryColumns } from './RepositoryColumns';
import { RepositoryChangesColumn } from './RepositoryChangesColumn';
import { RepositoryFileTree } from './RepositoryFileTree';
import { useRemoteCommits } from './use-remote-commits';
import { useLocalCommits } from './use-local-commits';
import type { ReadLocalCommit } from './local-commit-model';
import type { GenerateCommitMessage, PushLocalCommit, SubmitLocalCommit } from './local-submit-model';
import { combineRepositoryWorkspaces, reachableCommitIds, repositoryCommitTask, snapshotWorkspace, type RepositoryWorkspace } from './repository-model';
import type { LocalRepositoryState } from './use-workspace';
import type { ReadRemoteCommit, RemoteRepositoryState } from './remote-repository-model';
import type { FileTreeChange } from './file-tree';

const noChanges: FileTreeChange[] = [];

export function RepositoryView({ repository, account, localPath, localState, localLink, hiddenEntries, onToggleHidden, globalSearch, onSearchChange, searchRef, onConfigure, workspace: suppliedWorkspace, readLocalCommit: suppliedReadLocalCommit, remoteState, readRemoteCommit, submitCommit, pushCommit, applySync, generateCommitMessage, initialCommitTask }: {
  repository: RemoteRepository; account: Account; localPath?: string; localState?: LocalRepositoryState;
  localLink?: LocalLink; hiddenEntries?: ReadonlySet<string>; onToggleHidden?: () => void;
  globalSearch: string; onSearchChange?: (value: string) => void; searchRef?: RefObject<HTMLElement | null>;
  onConfigure: () => void; workspace?: RepositoryWorkspace;
  remoteState?: RemoteRepositoryState; readRemoteCommit?: ReadRemoteCommit;
  readLocalCommit?: ReadLocalCommit;
  applySync?: import('./repository-sync-model').ApplyRepositorySync; submitCommit?: SubmitLocalCommit; pushCommit?: PushLocalCommit; generateCommitMessage?: GenerateCommitMessage;
  initialCommitTask?: string | null;
}) {
  const current = localState?.path === localPath ? localState : undefined;
  const snapshot = current?.snapshot;
  const [focusedTask, setFocusedTask] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Record<string, string | undefined>>({});
  const [historyFiles, setHistoryFiles] = useState<Record<string, string | undefined>>({});
  const [commitSelection, setCommitSelection] = useState<{ taskId: string; commitId: string } | null>(null);
  const [localTaskChoice, setLocalTaskChoice] = useState<string | null>(initialCommitTask || null);
  const [commitOpenRequest, setCommitOpenRequest] = useState(0);
  const [branchSelection, setBranchSelection] = useState<ReadonlySet<string> | null>(null);
  const [action, setAction] = useState<{ mode: RepositoryActionMode; targets: RepositoryActionTarget[] } | null>(null);
  const [actionFeedback, setActionFeedback] = useState('');
  const [treeSourceChoice, setTreeSource] = useState<'remote' | 'local' | null>(null);
  const workspace = useMemo<RepositoryWorkspace>(() => {
    if (suppliedWorkspace) return suppliedWorkspace;
    const local = current?.workspace || (snapshot ? snapshotWorkspace(snapshot) : undefined);
    if (remoteState?.workspace) return combineRepositoryWorkspaces(remoteState.workspace, local);
    if (local) return local;
    return { source: 'remote', complete: false, commits: [], tasks: [{ id: 'remote:pending', branch: repository.defaultBranch || '默认分支', head: '', path: null, files: [], tree: [], remote: true, treeComplete: false, error: remoteState?.loading ? '' : remoteState?.error || '远端内容接口等待服务更新。' }] };
  }, [suppliedWorkspace, current?.workspace, snapshot, repository.defaultBranch, remoteState]);
  // Keep hidden cards mounted: heartbeat and focus must preserve each task's
  // draft, folder expansion and selected file instead of changing checkout.
  const focus = workspace.tasks.some(task => task.id === focusedTask) ? focusedTask : null;
  const treeSource = treeSourceChoice || (workspace.source === 'remote' || workspace.tasks.some(task => task.remote) ? 'remote' : 'local');
  const focusedBranch = workspace.tasks.find(task => task.id === focus)?.branch;
  const treeTasks = workspace.tasks.filter(task => (treeSource === 'remote') === !!task.remote);
  const treeHasFocusedTask = treeTasks.some(task => task.id === focus);
  const visibleTreeIds = new Set(treeTasks.filter(task => !focus || (treeHasFocusedTask ? task.id === focus : task.branch === focusedBranch)).map(task => task.id));
  const selection = commitSelection && workspace.tasks.some(task => task.id === commitSelection.taskId) ? commitSelection : null;
  const selectedCommits = useMemo<Record<string, string>>(() => selection ? { [selection.taskId]: selection.commitId } : {}, [selection]);
  const selectedCommit = workspace.commits.find(commit => commit.id === selection?.commitId);
  const remoteCommits = useRemoteCommits(workspace.tasks, focus, selectedCommits, readRemoteCommit);
  const localCommits = useLocalCommits(workspace.tasks, selectedCommits, suppliedReadLocalCommit || (async (task, commitId, signal) =>
    importAPI('localCommit', { repositoryId: repository.id, taskId: task.id, commitId }, signal)));
  const selectCommit = (id: string | null) => {
    if (!id) { setCommitSelection(null); return; }
    const task = repositoryCommitTask(workspace, id, focus);
    if (task) { setCommitSelection({ taskId: task.id, commitId: id }); if (task.remote) setSelectedFiles(previous => ({ ...previous, [task.id]: undefined })); }
    else setCommitSelection(null);
  };
  const select = (id: string, path?: string) => {
    if (selection?.taskId === id && !workspace.tasks.find(task => task.id === id)?.remote) {
      setHistoryFiles(previous => ({ ...previous, [JSON.stringify([id, selection.commitId])]: path }));
    } else setSelectedFiles(previous => ({ ...previous, [id]: path }));
  };
  const contextFiles = { ...selectedFiles };
  if (selection && !workspace.tasks.find(task => task.id === selection.taskId)?.remote) contextFiles[selection.taskId] = historyFiles[JSON.stringify([selection.taskId, selection.commitId])];
  const actionTasks = (localLink ? linkedTasks(localLink, current, hiddenEntries) : suppliedWorkspace?.tasks.filter(task => !task.remote && task.path) || []).filter(task => branchSelection === null || branchSelection.has(task.branch));
  const signals = gitSignals(actionTasks, remoteState || { workspace: null, loading: false, error: '' }, current, undefined, repository.available);
  const commit: SubmitLocalCommit = submitCommit || (input => importAPI('submitCommit', input));
  const push: PushLocalCommit = pushCommit || (input => importAPI('pushCommit', input));
  const generate = generateCommitMessage || generateWithService;
  const openAction = (mode: RepositoryActionMode) => {
    setAction({ mode, targets: repositoryActionTargets(repository, actionTasks, mode, remoteState || { workspace: null, loading: false, error: '' }, current) });
  };
  const publishedCommits = new Map(workspace.tasks.filter(task => task.remote).map(task => [task.branch, reachableCommitIds(workspace.commits, [task.head])]));
  return <main className="repository-workspace-view" aria-label="仓库工作台">
    <section className="repository-overview flat-group" aria-label="仓库信息">
      <div className="repository-overview-heading"><div className="repository-overview-title"><h1>{repository.name}</h1><p title={repository.url}>{repository.url}</p></div><div className="repository-overview-actions"><DashboardActionNames><RepositoryRowActions itemLabel={`${repository.fullName} · 当前筛选分支`} signals={signals} hidden={!!hiddenEntries?.has(hiddenEntryKey(repository.id))} onToggleHidden={onToggleHidden} onPull={repository.available && actionTasks.length ? () => openAction('pull') : undefined} onLatest={repository.available && actionTasks.length ? () => openAction('latest') : undefined} onClean={repository.available && actionTasks.length ? () => openAction('clean') : undefined} onCommit={() => openAction('commit')} onSubmit={() => openAction('submit')} onPush={() => openAction('push')} busy={!!action || !repository.available} /></DashboardActionNames></div></div>
      {(onSearchChange || focus) && <div className="repository-overview-tools">{onSearchChange && <div className="repository-workspace-search"><SearchBar inputRef={searchRef} value={globalSearch} onChange={onSearchChange} placeholder="搜索文件或提交…" /></div>}{focus && <Button variant="quiet" onClick={() => setFocusedTask(null)}>取消聚焦</Button>}</div>}
      {!repository.available && <Notice kind="info">账号目前无权访问此仓库；这里显示上次读取的信息。</Notice>}
    </section>
    {actionFeedback && <Notice kind="success">{actionFeedback}</Notice>}
    {action && <RepositoryOperationDialog mode={action.mode} targets={action.targets} onSync={applySync} onCommit={commit} onPush={push} onGenerate={generate} onComplete={setActionFeedback} onClose={() => setAction(null)} />}
    {current?.error && <Notice kind="error">{current.error}{snapshot && ' 显示上次读取的本地状态。'} 正在自动重试。</Notice>}
    {remoteState?.error && <Notice kind="error">{remoteState.error}{remoteState.workspace && ' 显示上次读取的远端内容。'}</Notice>}
    {remoteState?.workspace?.warnings.map(warning => <p className="repository-workspace-warning" key={warning}>{warning}</p>)}
    <RepositoryColumns>
      <section id="repository-graph-column" className="repository-column repository-graph-column flat-group" aria-label="分支图"><RepositoryGraph workspace={workspace} search={globalSearch} focusedTask={focus} onBranchFilterChange={setBranchSelection} onSelectCommit={selectCommit} onSelectWorkingTask={setLocalTaskChoice} emptyLabel={workspace.source === 'remote' && !workspace.commits.length ? remoteState?.loading ? '正在读取远端分支图…' : remoteState?.error || workspace.tasks.find(task => task.error)?.error || '远端仓库尚无提交' : undefined} /></section>
      <section id="repository-changes-column" className="repository-column repository-changes-column flat-group" aria-label="Diff 与提交"><RepositoryChangesColumn expandRequest={commitOpenRequest} repositoryId={repository.id} repositoryName={repository.fullName} onSubmit={commit} onGenerate={generate} onPush={push} onCommitted={(taskId, commitId) => { setCommitSelection({ taskId, commitId }); setCommitOpenRequest(value => value + 1); }} publishedCommits={publishedCommits} tasks={workspace.tasks} selection={selection} commit={selectedCommit} remoteCommits={remoteCommits} localCommits={localCommits} selectedFiles={contextFiles} onSelect={select} search={globalSearch} focus={focus} onFocus={setFocusedTask} localChoice={localTaskChoice} onLocalChoice={setLocalTaskChoice} localPath={localPath} loading={!!localPath && !current && !suppliedWorkspace} /></section>
      <section id="repository-tree-column" className="repository-column repository-tree-column flat-group" aria-label="文件树"><RepositoryColumnHeading title="文件树" icon="folder" controls="repository-tree-column"><Segmented<'remote' | 'local'> className="repository-tree-source" aria-label="文件树来源" aria-controls="repository-file-trees" value={treeSource} onValueChange={setTreeSource} items={[{ value: 'remote', label: '远端' }, { value: 'local', label: '本地' }]} /></RepositoryColumnHeading><div id="repository-file-trees" className={`repository-task-stack ${visibleTreeIds.size === 1 ? 'is-focused' : ''}`}>{workspace.tasks.map(task => {
        const commitId = selectedCommits[task.id];
        const state = task.remote ? remoteCommits[task.id] : localCommits[task.id];
        const details = commitId && state?.id === commitId ? state.details : null;
        return <div key={task.id} className="repository-task-slot" hidden={!visibleTreeIds.has(task.id)}><RepositoryFileTree task={task} repository={repository} account={account} changes={task.remote || commitId ? details?.files || noChanges : undefined} selected={contextFiles[task.id]} onSelect={path => select(task.id, path)} complete={task.remote ? task.treeComplete === true : current?.workspace ? !task.error : workspace.complete} /></div>;
      })}{!visibleTreeIds.size && <div className="repository-column-empty" role="status"><Icon name="folder" size={26} /><p>{treeSource === 'local' ? !localPath ? '尚未关联本地目录。' : current?.error || (focus ? '这个分支尚无本地文件树。' : '正在读取本地文件树…') : remoteState?.error || (focus ? '这个分支尚无远端文件树。' : remoteState?.workspace ? '远端仓库尚无文件。' : remoteState?.loading ? '正在读取远端文件树…' : '远端文件树尚未接入。')}</p>{treeSource === 'local' && !localPath && <Button onClick={onConfigure} disabled={!repository.available}>关联本地目录</Button>}</div>}</div></section>
    </RepositoryColumns>
  </main>;
}
