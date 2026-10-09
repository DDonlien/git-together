import { useMemo, useState, type RefObject } from 'react';
import { importAPI } from './import-api';
import { accountLabel, type Account, type RemoteRepository } from './import-model';
import { Button, Icon, Notice, SearchInput, Segmented } from './ui';
import { RepositoryGraph } from './RepositoryGraph';
import { RepositoryColumnHeading } from './RepositoryColumnHeading';
import type { ReadTaskDiff } from './RepositoryChanges';
import { RepositoryChangesColumn } from './RepositoryChangesColumn';
import { RepositoryFileTree } from './RepositoryFileTree';
import { useRemoteCommits } from './use-remote-commits';
import { combineRepositoryWorkspaces, snapshotWorkspace, taskCommitHistory, type RepositoryWorkspace } from './repository-model';
import type { LocalRepositoryState } from './use-workspace';
import type { ReadRemoteCommit, RemoteRepositoryState } from './remote-repository-model';
import type { FileTreeChange } from './file-tree';

const noChanges: FileTreeChange[] = [];

export function RepositoryView({ repository, account, localPath, localState, globalSearch, onSearchChange, searchRef, onConfigure, workspace: suppliedWorkspace, readDiff: suppliedReadDiff, remoteState, readRemoteCommit }: {
  repository: RemoteRepository; account: Account; localPath?: string; localState?: LocalRepositoryState;
  globalSearch: string; onSearchChange?: (value: string) => void; searchRef?: RefObject<HTMLInputElement | null>;
  onConfigure: () => void; workspace?: RepositoryWorkspace; readDiff?: ReadTaskDiff;
  remoteState?: RemoteRepositoryState; readRemoteCommit?: ReadRemoteCommit;
}) {
  const current = localState?.path === localPath ? localState : undefined;
  const snapshot = current?.snapshot;
  const [focusedTask, setFocusedTask] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Record<string, string | undefined>>({});
  const [commitSelection, setCommitSelection] = useState<{ taskId: string; commitId: string } | null>(null);
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
  const graphWorkspace = useMemo(() => ({ ...workspace, commits: taskCommitHistory(workspace, focus) }), [workspace, focus]);
  const selection = commitSelection && workspace.tasks.some(task => task.id === commitSelection.taskId) ? commitSelection : null;
  const selectedCommits = useMemo<Record<string, string>>(() => selection ? { [selection.taskId]: selection.commitId } : {}, [selection]);
  const selectedCommit = workspace.commits.find(commit => commit.id === selection?.commitId);
  const remoteCommits = useRemoteCommits(workspace.tasks, focus, selectedCommits, readRemoteCommit);
  const selectCommit = (id: string | null) => {
    if (!id) { setCommitSelection(null); return; }
    const task = workspace.tasks.find(task => task.id === focus) || workspace.tasks.find(task => task.remote && task.head === id) || workspace.tasks.find(task => task.remote && taskCommitHistory(workspace, task.id).some(commit => commit.id === id)) || workspace.tasks.find(task => task.head === id) || workspace.tasks.find(task => taskCommitHistory(workspace, task.id).some(commit => commit.id === id));
    if (task) { setCommitSelection({ taskId: task.id, commitId: id }); if (task.remote) setSelectedFiles(previous => ({ ...previous, [task.id]: undefined })); }
  };
  const select = (id: string, path?: string) => setSelectedFiles(previous => ({ ...previous, [id]: path }));
  const readDiff: ReadTaskDiff = suppliedReadDiff || (async (task, path, signal) => {
    return (await importAPI('diff', { repositoryId: repository.id, taskId: task.id, path }, signal)).text;
  });
  return <main className="repository-workspace-view" aria-label="仓库工作台">
    <section className="repository-overview flat-group" aria-label="仓库信息">
      <div className="repository-overview-heading"><div><h1>{repository.name}</h1><p title={repository.url}>{repository.url}</p></div></div>
      <dl><div><dt>访问账号</dt><dd title={accountLabel(account)}>{account.name}</dd></div><div><dt>默认分支</dt><dd className="branch-label"><Icon name="branch" size={14} />{repository.defaultBranch || '—'}</dd></div></dl>
      {repository.description && <p className="repository-overview-description">{repository.description}</p>}
      <div className="repository-overview-tools">{onSearchChange && <div className="repository-workspace-search"><SearchInput inputRef={searchRef} value={globalSearch} onChange={onSearchChange} placeholder="搜索文件或提交…" /></div>}<span className="repository-task-count">{remoteState?.loading && !remoteState.workspace ? '正在读取远端…' : workspace.tasks.some(task => task.id === 'remote:pending') ? remoteState ? '远端读取失败，正在自动重试' : '远端内容未接入' : `${workspace.tasks.length} 个任务`}</span>{focus && <Button variant="quiet" onClick={() => setFocusedTask(null)}>显示全部任务</Button>}</div>
      {!repository.available && <Notice kind="info">账号目前无权访问此仓库；这里显示上次读取的信息。</Notice>}
    </section>
    {current?.error && <Notice kind="error">{current.error}{snapshot && ' 显示上次读取的本地状态。'} 正在自动重试。</Notice>}
    {remoteState?.error && <Notice kind="error">{remoteState.error}{remoteState.workspace && ' 显示上次读取的远端内容。'}</Notice>}
    {remoteState?.workspace?.warnings.map(warning => <p className="repository-workspace-warning" key={warning}>{warning}</p>)}
    <div className="repository-columns-scroll"><div className="repository-columns">
      <section id="repository-graph-column" className="repository-column repository-graph-column flat-group" aria-label="分支图"><RepositoryGraph workspace={graphWorkspace} search={globalSearch} focusedTask={focus} defaultBranch={repository.defaultBranch} onSelectCommit={selectCommit} emptyLabel={workspace.source === 'remote' && !workspace.commits.length ? remoteState?.loading ? '正在读取远端分支图…' : remoteState?.error || workspace.tasks.find(task => task.error)?.error || '远端仓库尚无提交' : undefined} /></section>
      <section id="repository-changes-column" className="repository-column repository-changes-column flat-group" aria-label="Diff 与提交"><RepositoryChangesColumn tasks={workspace.tasks} selection={selection} commit={selectedCommit} remoteCommits={remoteCommits} selectedFiles={selectedFiles} onSelect={select} search={globalSearch} focus={focus} onFocus={setFocusedTask} localPath={localPath} readDiff={readDiff} loading={!!localPath && !current && !suppliedWorkspace} /></section>
      <section id="repository-tree-column" className="repository-column repository-tree-column flat-group" aria-label="文件树"><RepositoryColumnHeading title="文件树" icon="folder" controls="repository-tree-column"><Segmented<'remote' | 'local'> className="repository-tree-source" aria-label="文件树来源" aria-controls="repository-file-trees" value={treeSource} onValueChange={setTreeSource} items={[{ value: 'remote', label: '远端' }, { value: 'local', label: '本地' }]} /></RepositoryColumnHeading><div id="repository-file-trees" className={`repository-task-stack ${visibleTreeIds.size === 1 ? 'is-focused' : ''}`}>{workspace.tasks.map(task => {
        const commitId = selectedCommits[task.id];
        const details = commitId && remoteCommits[task.id]?.id === commitId ? remoteCommits[task.id]?.details : null;
        return <div key={task.id} className="repository-task-slot" hidden={!visibleTreeIds.has(task.id)}><RepositoryFileTree task={task} repository={repository} account={account} changes={task.remote ? details?.files || noChanges : undefined} selected={selectedFiles[task.id]} onSelect={path => select(task.id, path)} complete={task.remote ? task.treeComplete === true : current?.workspace ? !task.error : workspace.complete} /></div>;
      })}{!visibleTreeIds.size && <div className="repository-column-empty" role="status"><Icon name="folder" size={26} /><p>{treeSource === 'local' ? !localPath ? '尚未关联本地目录。' : current?.error || (focus ? '这个分支尚无本地文件树。' : '正在读取本地文件树…') : remoteState?.error || (focus ? '这个分支尚无远端文件树。' : remoteState?.workspace ? '远端仓库尚无文件。' : remoteState?.loading ? '正在读取远端文件树…' : '远端文件树尚未接入。')}</p>{treeSource === 'local' && !localPath && <Button onClick={onConfigure} disabled={!repository.available}>关联本地目录</Button>}</div>}</div></section>
    </div></div>
  </main>;
}
