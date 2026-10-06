import { useMemo, useState } from 'react';
import { Icon } from './ui';
import { layoutCommitGraph, type RepositoryWorkspace } from './repository-model';

export function RepositoryGraph({ workspace, search, focusedTask, onSelectCommit, emptyLabel }: { workspace: RepositoryWorkspace; search: string; focusedTask: string | null; onSelectCommit?: (id: string | null, previousId: string | null) => void; emptyLabel?: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const rows = useMemo(() => layoutCommitGraph(workspace.commits), [workspace.commits]);
  const incoming = useMemo(() => new Set(workspace.commits.flatMap(commit => commit.parents)), [workspace.commits]);
  const lanes = Math.max(1, ...rows.map(row => row.width));
  const query = search.toLowerCase();
  const task = workspace.tasks.find(item => item.id === focusedTask);
  return <>
    <div className="repository-graph-scroll">
      {rows.length ? <table className="repository-graph-table" aria-label="提交历史"><colgroup><col style={{ width: lanes * 14 + 20 }} /><col /><col style={{ width: 74 }} /></colgroup><tbody>
        {rows.map(({ commit, lane, edges }) => {
          const matching = !query || `${commit.summary} ${commit.author} ${commit.refs.join(' ')} ${commit.id}`.toLowerCase().includes(query);
          return <tr key={commit.id} className={`${selected === commit.id ? 'selected' : ''} ${matching ? '' : 'graph-dimmed'} ${task?.head === commit.id ? 'graph-task-head' : ''}`}>
            <td className="repository-graph-lane"><svg width={lanes * 14 + 14} height="60" viewBox={`0 0 ${lanes * 14 + 14} 60`} aria-hidden="true">
              {edges.map((edge, index) => <path key={index} d={`M ${edge.from * 14 + 12} ${edge.node ? 30 : 0} C ${edge.from * 14 + 12} 46, ${edge.to * 14 + 12} 46, ${edge.to * 14 + 12} 60`} className={`graph-line graph-color-${edge.from % 4}`} />)}
              {incoming.has(commit.id) && <path d={`M ${lane * 14 + 12} 0 V 30`} className={`graph-line graph-color-${lane % 4}`} />}
              <circle cx={lane * 14 + 12} cy="30" r="3.6" className={`graph-node graph-color-${lane % 4}`} />
            </svg></td>
            <td><button className="repository-graph-description" onClick={() => { const next = selected === commit.id ? null : commit.id; setSelected(next); onSelectCommit?.(next, selected); }} aria-pressed={selected === commit.id} title={commit.summary}>
              {commit.refs.length > 0 && <span className="commit-ref-list">{commit.refs.map(ref => <span className="commit-ref" key={ref}>{ref}</span>)}</span>}
              <strong>{commit.summary}</strong><code>{commit.id.slice(0, 8)}</code>
            </button></td>
            <td className="repository-graph-byline"><span title={commit.author}>{commit.author}</span><time dateTime={commit.time} title={new Date(commit.time).toLocaleString()}>{new Date(commit.time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</time></td>
          </tr>;
        })}
      </tbody></table> : <div className="repository-column-empty"><Icon name="branch" size={28} /><p>{emptyLabel || (workspace.complete ? focusedTask ? '当前读取范围内没有这个任务的提交' : '仓库尚无提交' : '分支图读取等待服务更新')}</p></div>}
    </div>
    {!workspace.complete && !workspace.source && workspace.commits.length > 0 && <p className="repository-data-note">最近提交；完整分支关系等待服务更新。</p>}
  </>;
}
