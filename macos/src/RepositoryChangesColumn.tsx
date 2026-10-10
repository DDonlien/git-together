import { useState } from 'react';
import { Icon, IconButton, Menu, MenuItem } from './ui';
import { RepositoryColumnHeading } from './RepositoryColumnHeading';
import { RepositoryChanges } from './RepositoryChanges';
import { RepositoryRemoteChanges } from './RepositoryRemoteChanges';
import type { RepositoryCommit, RepositoryTask } from './repository-model';
import type { RemoteCommitState } from './use-remote-commits';
import type { LocalCommitState } from './local-commit-model';

export function RepositoryChangesColumn({ tasks, selection, commit, remoteCommits, localCommits = {}, selectedFiles, onSelect, search, focus, onFocus, localChoice, onLocalChoice, localPath, loading }: {
  tasks: RepositoryTask[]; selection: { taskId: string; commitId: string } | null; commit?: RepositoryCommit;
  remoteCommits: Record<string, RemoteCommitState>; selectedFiles: Record<string, string | undefined>;
  localCommits?: Record<string, LocalCommitState>;
  onSelect: (taskId: string, path?: string) => void; search: string; focus: string | null; onFocus: (taskId: string | null) => void;
  localChoice: string | null; onLocalChoice: (taskId: string) => void;
  localPath?: string; loading: boolean;
}) {
  const [grouped, setGrouped] = useState(false);
  const localTasks = tasks.filter(task => !task.remote);
  const localTask = localTasks.find(task => task.id === localChoice) || localTasks.find(task => task.id === focus) || localTasks.find(task => task.path === localPath) || localTasks.find(task => task.path) || localTasks[0];
  const activeId = selection?.taskId || localTask?.id;
  return <>
    <RepositoryColumnHeading title="更改与 Diff" icon="code" controls="repository-changes-column">
      {!selection && localTasks.length > 1 && <Menu label="本地工作目录" placement="end" trigger={<IconButton icon="branch" label="选择本地工作目录" />}>
        {localTasks.map(task => <MenuItem key={task.id} aria-current={activeId === task.id ? 'true' : undefined} onClick={() => onLocalChoice(task.id)}><span className="graph-menu-branch">{task.branch}<small>{task.path || '未检出分支'}</small></span>{activeId === task.id && <Icon name="check" size={14} />}</MenuItem>)}
      </Menu>}
      <Menu label="差异显示方式" placement="end" trigger={<IconButton icon="list" label="差异显示方式" />}>
        <MenuItem aria-current={!grouped ? 'true' : undefined} onClick={() => setGrouped(false)}>文件列表{!grouped && <Icon name="check" size={14} />}</MenuItem>
        <MenuItem aria-current={grouped ? 'true' : undefined} onClick={() => setGrouped(true)}>按状态分组{grouped && <Icon name="check" size={14} />}</MenuItem>
      </Menu>
    </RepositoryColumnHeading>
    <div className="repository-task-stack repository-change-context">
      {tasks.map(task => {
        const selectedCommit = selection?.taskId === task.id ? commit : undefined;
        return <div key={task.id} className="repository-task-slot" hidden={activeId !== task.id}>
          {task.remote ? <RepositoryRemoteChanges task={task} commitId={selection?.taskId === task.id ? selection.commitId : ''} selectedCommit={selectedCommit} state={remoteCommits[task.id]} selected={selectedFiles[task.id]} onSelect={path => onSelect(task.id, path)} search={search} grouped={grouped} /> : <RepositoryChanges task={task} selectedCommit={selectedCommit} historyState={localCommits[task.id]} selected={selectedFiles[task.id]} onSelect={path => onSelect(task.id, path)} search={search} grouped={grouped} focused={focus === task.id} onFocus={() => onFocus(focus === task.id ? null : task.id)} loading={loading} linked={!!localPath} showFocus={localTasks.length > 1} />}
        </div>;
      })}
      {!activeId && <div className="repository-column-empty" role="status"><Icon name="commit" size={28} /><p>选择一个提交查看差异</p><small>关联本地目录后可查看未提交更改</small></div>}
    </div>
  </>;
}
