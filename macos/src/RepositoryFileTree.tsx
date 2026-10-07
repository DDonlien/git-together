import { useMemo, useRef, useState } from 'react';
import { Icon, IconButton } from './ui';
import type { RepositoryTask } from './repository-model';
import type { Account, RemoteRepository } from './import-model';
import { importAPI } from './import-api';
import { repositoryFileURL } from './repository-file-url';
import { decoratedFileTree, type DecoratedFileTreeNode, type FileTreeChange } from './file-tree';

const changeLabels = { added: { letter: 'A', description: '新增' }, modified: { letter: 'M', description: '修改' }, deleted: { letter: 'D', description: '删除' } };

type FileActions = { label: (path: string) => string; unavailable: (node: DecoratedFileTreeNode) => string; open: (path: string) => void; opening: string | null };

function TreeNode({ node, depth, selected, onSelect, actions }: { node: DecoratedFileTreeNode; depth: number; selected?: string; onSelect: (path: string) => void; actions?: FileActions }) {
  const status = node.change ? changeLabels[node.change] : undefined;
  const description = status ? `${node.name}，${status.description}${node.missing ? '，当前目录中不存在' : ''}` : undefined;
  if (node.directory) return <details className="repository-tree-directory" open={depth < 1}>
    <summary className="repository-tree-row" data-change={node.change} title={status ? `${node.path} · 目录内有差异` : node.path} aria-label={description}><span className="tree-disclosure"><Icon name="right" size={11} /></span><Icon name="folder" size={16} /><span className="repository-tree-name">{node.name}</span>{status && <code aria-hidden="true">{status.letter}</code>}</summary>
    <div className="repository-tree-children">{node.children.map(child => <TreeNode key={child.path} node={child} depth={depth + 1} selected={selected} onSelect={onSelect} actions={actions} />)}</div>
  </details>;
  const unavailable = actions?.unavailable(node);
  return <div className={`repository-tree-row tree-file ${selected === node.path ? 'selected' : ''}`} data-change={node.change} data-missing={node.missing || undefined}>
    <button type="button" className="repository-tree-select" title={status ? `${node.path} · ${status.description}${node.missing ? ' · 当前目录中不存在' : ''}` : node.path} aria-label={description} onClick={() => onSelect(node.path)} aria-pressed={selected === node.path}><span className="tree-disclosure" /><Icon name="file" size={15} /><span className="repository-tree-name">{node.name}</span>{status && <code aria-hidden="true">{status.letter}</code>}</button>
    {actions && <IconButton className="repository-tree-open" icon={actions.opening === node.path ? 'spinner' : 'external'} label={unavailable ? `${node.path}：${unavailable}` : actions.label(node.path)} disabled={!!unavailable || actions.opening !== null} aria-busy={actions.opening === node.path || undefined} onClick={() => actions.open(node.path)} />}
  </div>;
}

export function RepositoryFileTree({ task, selected, onSelect, complete, changes, repository, account }: { task: RepositoryTask; selected?: string; onSelect: (path: string) => void; complete: boolean; changes?: FileTreeChange[]; repository?: RemoteRepository; account?: Account }) {
  const nodes = useMemo(() => decoratedFileTree(task.tree, changes || task.files), [task.tree, changes, task.files]);
  const [opening, setOpening] = useState<string | null>(null);
  const [openError, setOpenError] = useState('');
  const inFlight = useRef(false);
  const actions: FileActions | undefined = repository && account ? {
    opening,
    label: path => task.remote ? `在 ${account.provider === 'github' ? 'GitHub' : 'Gitea'} 打开 ${path}` : `用默认应用打开 ${path}`,
    unavailable: node => node.missing ? '当前目录中不存在，无法打开' : !repository.available ? '当前账号无权访问' : task.remote ? repositoryFileURL(account, repository, task.head, node.path) ? '' : '远端文件地址不可用' : task.path ? '' : '这个分支未检出到本地',
    open: path => {
      if (inFlight.current) return;
      setOpenError('');
      if (task.remote && !window.gittogether) {
        const url = repositoryFileURL(account, repository, task.head, path);
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
        return;
      }
      inFlight.current = true; setOpening(path);
      void importAPI('openFile', task.remote ? { repositoryId: repository.id, source: 'remote', commitId: task.head, path } : { repositoryId: repository.id, source: 'local', taskId: task.id, path })
        .catch(problem => setOpenError(problem instanceof Error ? problem.message : '文件打开失败。'))
        .finally(() => { inFlight.current = false; setOpening(null); });
    },
  } : undefined;
  return <section className="repository-tree-task" aria-label={`文件树：${task.branch}`}>
    <div className="repository-tree-identity"><span className="repository-tree-branch"><Icon name="branch" size={14} /><strong title={task.branch}>{task.branch}</strong></span>{!task.remote && <small>{task.path ? 'worktree' : '分支'}</small>}<code title={task.head || undefined}>{task.head.slice(0, 8) || '未读取'}</code></div>
    {!task.remote && <p className="repository-task-path" title={task.path || undefined}>{task.path || '未检出'}</p>}
    <div className="repository-task-tree">{nodes.length ? nodes.map(node => <TreeNode key={node.path} node={node} depth={0} selected={selected} onSelect={onSelect} actions={actions} />) : <p className="repository-tree-empty">{task.error ? '文件树暂不可用。' : task.remote ? complete ? '所选远端分支没有文件。' : '正在读取远端文件树…' : task.path ? '没有可显示的文件。' : '分支文件树读取等待服务更新。'}</p>}</div>
    {openError && <p className="repository-task-error" role="alert">{openError}</p>}
    {!complete && task.path && <p className="repository-data-note">当前仅列出更改文件；完整目录等待服务更新。</p>}
    {task.remote && task.treeComplete === false && task.tree.length > 0 && <p className="repository-data-note">文件树不完整，显示已读取部分。</p>}
    {task.error && <p className="repository-task-error" role="alert">{task.error}</p>}
  </section>;
}
