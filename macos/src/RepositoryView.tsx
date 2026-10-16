import { usesSystemAuthentication } from './repository-auth-model';
import { PresenceManagedMark, PresenceManagedDetails, usePresenceRepositoryIcon } from './PresenceManaged';
import { useMemo, useState, type MouseEvent, type RefObject } from 'react';
import { RepositoryPresence } from './RepositoryPresence';
import { generateCommitMessage as generateWithService, importAPI } from './import-api';
import { type Account, type LocalLink, type RemoteRepository } from './import-model';
import { Button, Icon, Notice, Segmented } from './ui';
import { SearchBar } from './material-inputs';
import { RepositoryRowActions } from './RepositoryActions';
import { PushFeedbackIcon, PushProgress, repositoryPushState, usePushActivity } from './PushFeedback';
import { DashboardActionNames } from './DashboardActionNames';
import { useRepositoryOperations } from './RepositoryOperationProvider';
import type { RepositoryActionMode, RepositoryActionTarget } from './repository-action-model';
import { repositoryActionTargets, repositoryOperationScope } from './repository-action-model';
import { gitSignals, hiddenEntryKey, linkedTasks } from './branch-links';
import { RepositoryGraph } from './RepositoryGraph';
import { RepositoryColumnHeading } from './RepositoryColumnHeading';
import { RepositoryColumns } from './RepositoryColumns';
import { RepositoryChangesColumn } from './RepositoryChangesColumn';
import { RepositoryFileTree } from './RepositoryFileTree';
import { useRemoteCommits } from './use-remote-commits';
import { useLocalCommits } from './use-local-commits';
import { useRemoteHistory } from './use-remote-history';
import type { ReadLocalCommit } from './local-commit-model';
import type { GenerateCommitMessage, PushLocalCommit, SubmitLocalCommit } from './local-submit-model';
import { combineRepositoryWorkspaces, reachableCommitIds, repositoryCommitTask, snapshotWorkspace, type RepositoryWorkspace } from './repository-model';
import type { LocalRepositoryState } from './use-workspace';
import type { ReadRemoteCommit, RemoteRepositoryState } from './remote-repository-model';
import type { FileTreeChange } from './file-tree';
import { NavigationControls } from './NavigationControls';
import { graphOperationScope, type GraphAction, type GraphWrite } from './graph-operation-model';

const noChanges: FileTreeChange[] = [];

export function RepositoryView({ repository, account, localPath, localState, localLink, hiddenEntries, manualHiddenEntries, onToggleHidden, globalSearch, onSearchChange, searchRef, onConfigure, workspace: suppliedWorkspace, readLocalCommit: suppliedReadLocalCommit, remoteState, readRemoteCommit, submitCommit, pushCommit, applySync, writeGraph, generateCommitMessage, initialCommitTask, canGoBack = false, canRedo = false, onBack = () => {}, onRedo = () => {}, onRefresh = () => {}, refreshDisabled = false, refreshing = false, refreshFeedback, onLocalFilesChanged }: {
  repository: RemoteRepository; account: Account; localPath?: string; localState?: LocalRepositoryState;
  localLink?: LocalLink; hiddenEntries?: ReadonlySet<string>; manualHiddenEntries?: ReadonlySet<string>; onToggleHidden?: () => void;
  globalSearch: string; onSearchChange?: (value: string) => void; searchRef?: RefObject<HTMLElement | null>;
  onConfigure: () => void; workspace?: RepositoryWorkspace;
  remoteState?: RemoteRepositoryState; readRemoteCommit?: ReadRemoteCommit;
  readLocalCommit?: ReadLocalCommit;
  applySync?: import('./repository-sync-model').ApplyRepositorySync; submitCommit?: SubmitLocalCommit; pushCommit?: PushLocalCommit; generateCommitMessage?: GenerateCommitMessage;
  writeGraph?: GraphWrite;
  initialCommitTask?: string | null;
  canGoBack?: boolean; canRedo?: boolean; onBack?: () => void; onRedo?: () => void; onRefresh?: () => void; refreshDisabled?: boolean; refreshing?: boolean;
  refreshFeedback?: { kind: 'success' | 'error' | 'info'; message: string } | null;
  onLocalFilesChanged?: () => void;
}) {
  const current = localState?.path === localPath ? localState : undefined;
  const snapshot = current?.snapshot;
  const [focusedTask, setFocusedTask] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Record<string, string | undefined>>({});
  const [historyFiles, setHistoryFiles] = useState<Record<string, string | undefined>>({});
  const folder = usePresenceRepositoryIcon(repository);
  const [commitSelection, setCommitSelection] = useState<{ taskId: string; commitId: string } | null>(null);
  const [localTaskChoice, setLocalTaskChoice] = useState<string | null>(initialCommitTask || null);
  const [commitOpenRequest, setCommitOpenRequest] = useState(0);
  const [branchSelection, setBranchSelection] = useState<ReadonlySet<string> | null | undefined>(undefined);
  const operations = useRepositoryOperations();
  const [actionFeedback, setActionFeedback] = useState('');
  const [repositoryOpenError, setRepositoryOpenError] = useState('');
  const [openingRepository, setOpeningRepository] = useState(false);
  const [treeSourceChoice, setTreeSource] = useState<'remote' | 'local' | null>(null);
  const remoteTaskError = remoteState?.workspace || current?.workspace || snapshot ? '' : remoteState?.loading ? '' : remoteState?.error || '远端内容接口等待服务更新。';
  const baseWorkspace = useMemo<RepositoryWorkspace>(() => {
    if (suppliedWorkspace) return suppliedWorkspace;
    const local = current?.workspace || (snapshot ? snapshotWorkspace(snapshot) : undefined);
    if (remoteState?.workspace) return combineRepositoryWorkspaces(remoteState.workspace, local);
    if (local) return local;
    return { source: 'remote', complete: false, commits: [], tasks: [{ id: 'remote:pending', branch: repository.defaultBranch || '默认分支', head: '', path: null, files: [], tree: [], remote: true, treeComplete: false, error: remoteTaskError }] };
  }, [suppliedWorkspace, current?.workspace, snapshot, repository.defaultBranch, remoteState?.workspace, remoteTaskError]);
  const history = useRemoteHistory(baseWorkspace, repository.id);
  const workspace = history.workspace;
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
  const actionTasks = (localLink ? linkedTasks(localLink, current, branchSelection === undefined ? hiddenEntries : manualHiddenEntries || hiddenEntries) : suppliedWorkspace?.tasks.filter(task => !task.remote && task.path) || []).filter(task => branchSelection == null || branchSelection.has(task.branch));
  const signals = gitSignals(actionTasks, remoteState || { workspace: null, loading: false, error: '' }, current, undefined, repository.available, usesSystemAuthentication(localLink));
  const pushActivity = usePushActivity(), pushRun = pushActivity.runs[repository.id];
  const pushState = repositoryPushState(pushRun, workspace.tasks);
  const commit: SubmitLocalCommit = submitCommit || (input => importAPI('submitCommit', input));
  const push: PushLocalCommit = pushCommit || (input => importAPI('pushCommit', input));
  const generate = generateCommitMessage || generateWithService;
  const openAction = (mode: RepositoryActionMode) => {
    setActionFeedback('');
    operations.open({ mode, scope: repositoryOperationScope(repository.id), targets: repositoryActionTargets(repository, actionTasks, mode, remoteState || { workspace: null, loading: false, error: '' }, current, localLink), onSync: applySync, onCommit: commit, onPush: push, onGenerate: generate, onComplete: setActionFeedback });
  };
  const graphTargets = workspace.tasks.filter(task => !task.remote && task.path && !task.error && task.changeKey && /^[a-f0-9]{40,64}$/.test(task.head));
  const openGraphAction = (mode: GraphAction, selected: import('./commit-graph').GraphCommit) => {
    const task = graphTargets.find(task => task.id === selected.workingTask?.id) || graphTargets.find(task => task.id === focus || task.id === localTaskChoice) || graphTargets.find(task => task.branch === repository.defaultBranch) || graphTargets[0];
    if (!task) { setActionFeedback('请先关联一个本地工作目录，再执行图谱操作。'); return; }
    operations.open({ kind: 'graph', mode, repository, commit: selected.workingTask ? undefined : selected, scope: graphOperationScope(repository.id, mode, task.id, selected.workingTask ? undefined : selected.id), targets: [{ repositoryId: repository.id, repositoryName: repository.fullName, task }], candidates: structuredClone(graphTargets), onWrite: writeGraph, onComplete: setActionFeedback });
  };
  const locateGraphWorktree = (selected: import('./commit-graph').GraphCommit) => {
    const task = selected.workingTask || graphTargets.find(task => reachableCommitIds(workspace.commits, [task.head]).has(selected.id));
    if (!task) { setActionFeedback('这个提交尚未关联可定位的本地工作目录。'); return; }
    setLocalTaskChoice(task.id); setFocusedTask(task.id); setTreeSource('local');
  };
  const openGraphCommit = (selected: import('./commit-graph').GraphCommit) => {
    void importAPI('openCommit', { repositoryId: repository.id, commitId: selected.id }).catch(problem => setActionFeedback(problem instanceof Error ? problem.message : '远端提交打开失败。'));
  };
  const openRepository = async (event: MouseEvent<HTMLAnchorElement>) => {
    if (!window.gittogether) return;
    event.preventDefault();
    if (openingRepository) return;
    setRepositoryOpenError(''); setOpeningRepository(true);
    try { await importAPI('openRepository', { repositoryId: repository.id }); }
    catch (problem) { setRepositoryOpenError(problem instanceof Error ? problem.message : '仓库页面打开失败。'); }
    finally { setOpeningRepository(false); }
  };
  const publishedCommits = new Map(workspace.tasks.filter(task => task.remote).map(task => [task.branch, reachableCommitIds(workspace.commits, [task.head])]));
  const defaultHiddenBranches = useMemo(() => new Set(workspace.tasks.filter(task => hiddenEntries?.has(hiddenEntryKey(repository.id, task.branch))).map(task => task.branch)), [workspace.tasks, hiddenEntries, repository.id]);
  return <main className="repository-workspace-view" aria-label="仓库工作台">
    <section className="repository-overview flat-group" aria-label="仓库信息">
      <div className="repository-overview-heading"><div className="repository-overview-title"><div className="repository-managed-title"><span className="repository-detail-folder" title={folder.title}><Icon name={folder.icon} size={24} /><PresenceManagedMark repository={repository} /></span><div><h1>{repository.name}</h1><p title={repository.url}><a className="repository-url" href={repository.url} target="_blank" rel="noopener noreferrer" aria-label={`用默认浏览器打开 ${repository.fullName}`} aria-busy={openingRepository || undefined} onClick={openRepository} onAuxClick={event => { if (event.button === 1) void openRepository(event); }}>{repository.url}</a></p></div></div></div><div className="repository-overview-actions"><DashboardActionNames><RepositoryRowActions allowUnknownPush={usesSystemAuthentication(localLink)} operationScope={repositoryOperationScope(repository.id)} operationTargets={actionTasks.map(task => ({ repositoryId: repository.id, repositoryName: repository.fullName, task }))} itemLabel={`${repository.fullName} · 当前筛选分支`} signals={signals} hidden={!!hiddenEntries?.has(hiddenEntryKey(repository.id))} onToggleHidden={onToggleHidden} onPull={(repository.available || usesSystemAuthentication(localLink)) && actionTasks.length ? () => openAction('pull') : undefined} onLatest={(repository.available || usesSystemAuthentication(localLink)) && actionTasks.length ? () => openAction('latest') : undefined} onClean={(repository.available || usesSystemAuthentication(localLink)) && actionTasks.length ? () => openAction('clean') : undefined} onCommit={() => openAction('commit')} onSubmit={() => openAction('submit')} onPush={() => openAction('push')} busy={!repository.available && !usesSystemAuthentication(localLink)} /></DashboardActionNames></div></div>
      {(onSearchChange || focus) && <div className="repository-overview-tools">{onSearchChange && <div className="repository-workspace-search"><SearchBar inputRef={searchRef} value={globalSearch} onChange={onSearchChange} placeholder="搜索文件或提交…" /></div>}<NavigationControls canGoBack={canGoBack} canRedo={canRedo} refreshing={refreshing} refreshDisabled={refreshDisabled} onBack={onBack} onRedo={onRedo} onRefresh={onRefresh} />{focus && <Button variant="quiet" onClick={() => setFocusedTask(null)}>取消聚焦</Button>}</div>}
      {!repository.available && <Notice kind="info">账号目前无权访问此仓库；这里显示上次读取的信息。</Notice>}
      {refreshFeedback && <Notice kind={refreshFeedback.kind}>{refreshFeedback.message}</Notice>}
      <PresenceManagedDetails repository={repository} />
      <RepositoryPresence repository={repository} />
    </section>
    {repositoryOpenError && <Notice kind="error">{repositoryOpenError}</Notice>}
    {pushState && <div className="repository-push-status"><PushFeedbackIcon state={pushState} />{pushState.phase === 'pushing' && <PushProgress completed={pushRun.reduce((count, run) => count + run.completed.length, 0)} total={pushRun.reduce((count, run) => count + run.targets.length, 0)} />}</div>}
    {actionFeedback && <Notice kind="success">{actionFeedback}</Notice>}
    {current?.error && <Notice kind="error">{current.error}{snapshot && ' 显示上次读取的本地状态。'} 正在自动重试。</Notice>}
    {remoteState?.error && <Notice kind="error">{remoteState.error}{remoteState.workspace && ' 显示上次读取的远端内容。'}</Notice>}
    {remoteState?.workspace?.warnings.filter(warning => !warning.startsWith('每个分支当前读取最近 ')).map(warning => <p className="repository-workspace-warning" key={warning}>{warning}</p>)}
    <RepositoryColumns>
      <section id="repository-graph-column" className="repository-column repository-graph-column flat-group" aria-label="分支图"><RepositoryGraph onAction={graphTargets.length && (repository.available || usesSystemAuthentication(localLink)) ? openGraphAction : undefined} onOpenCommit={openGraphCommit} onLocateWorktree={locateGraphWorktree} workspace={workspace} loading={!!remoteState?.loading || !!current?.loading} defaultHiddenBranches={defaultHiddenBranches} search={globalSearch} focusedTask={focus} onBranchFilterChange={setBranchSelection} onSelectCommit={selectCommit} onSelectWorkingTask={setLocalTaskChoice} historyLoadingBranches={history.loadingBranches} historyErrorsByBranch={history.errorsByBranch} onLoadMoreHistory={history.loadMore} emptyLabel={workspace.source === 'remote' && !workspace.commits.length ? remoteState?.loading ? '正在读取远端分支图…' : remoteState?.error || workspace.tasks.find(task => task.error)?.error || '远端仓库尚无提交' : undefined} /></section>
      <section id="repository-changes-column" className="repository-column repository-changes-column flat-group" aria-label="Diff 与提交"><RepositoryChangesColumn repository={repository} onConfigure={repository.available || localLink ? onConfigure : undefined} expandRequest={commitOpenRequest} repositoryId={repository.id} repositoryName={repository.fullName} onSubmit={commit} onGenerate={generate} onPush={push} onCommitted={(taskId, commitId) => { setCommitSelection({ taskId, commitId }); setCommitOpenRequest(value => value + 1); }} publishedCommits={publishedCommits} tasks={workspace.tasks} selection={selection} commit={selectedCommit} remoteCommits={remoteCommits} localCommits={localCommits} selectedFiles={contextFiles} onSelect={select} search={globalSearch} focus={focus} onFocus={setFocusedTask} localChoice={localTaskChoice} onLocalChoice={setLocalTaskChoice} localPath={localPath} loading={!!localPath && !current && !suppliedWorkspace} /></section>
      <section id="repository-tree-column" className="repository-column repository-tree-column flat-group" aria-label="文件树"><RepositoryColumnHeading title="文件树" icon="folder" controls="repository-tree-column"><Segmented<'remote' | 'local'> className="repository-tree-source" aria-label="文件树来源" aria-controls="repository-file-trees" value={treeSource} onValueChange={setTreeSource} items={[{ value: 'remote', label: '远端' }, { value: 'local', label: '本地' }]} /></RepositoryColumnHeading><div id="repository-file-trees" className={`repository-task-stack ${visibleTreeIds.size === 1 ? 'is-focused' : ''}`}>{workspace.tasks.map(task => {
        const commitId = selectedCommits[task.id];
        const state = task.remote ? remoteCommits[task.id] : localCommits[task.id];
        const details = commitId && state?.id === commitId ? state.details : null;
        return <div key={task.id} className="repository-task-slot" hidden={!visibleTreeIds.has(task.id)}><RepositoryFileTree onChanged={onLocalFilesChanged} task={task} repository={repository} account={account} changes={task.remote || commitId ? details?.files || noChanges : undefined} selected={contextFiles[task.id]} onSelect={path => select(task.id, path)} complete={task.remote ? task.treeComplete === true : current?.workspace ? !task.error : workspace.complete} /></div>;
      })}{!visibleTreeIds.size && <div className="repository-column-empty" role="status"><Icon name="folder" size={26} /><p>{treeSource === 'local' ? !localPath ? '尚未关联本地目录。' : current?.error || (focus ? '这个分支尚无本地文件树。' : '正在读取本地文件树…') : remoteState?.error || (focus ? '这个分支尚无远端文件树。' : remoteState?.workspace ? '远端仓库尚无文件。' : remoteState?.loading ? '正在读取远端文件树…' : '远端文件树尚未接入。')}</p>{treeSource === 'local' && !localPath && <Button onClick={onConfigure} disabled={!repository.available}>关联本地目录</Button>}</div>}</div></section>
    </RepositoryColumns>
  </main>;
}
