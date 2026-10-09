import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Button, Icon, Menu, MenuItem, Popover } from './ui';
import { RepositoryColumnHeading } from './RepositoryColumnHeading';
import { commitMatchesSearch, graphNavigationIndex, layoutCommitGraph, nextGraphMatch, parseCommitSearch, repositoryGraphBranches, repositoryGraphCommits, type GraphBranch } from './commit-graph';
import type { RepositoryCommit, RepositoryWorkspace } from './repository-model';

function GraphText({ text, term }: { text: string; term: string }) {
  const at = term ? text.toLowerCase().indexOf(term) : -1;
  return at < 0 ? <>{text}</> : <>{text.slice(0, at)}<mark>{text.slice(at, at + term.length)}</mark>{text.slice(at + term.length)}</>;
}

function CommitActions({ commit, onCopy, onLocateParent }: { commit?: RepositoryCommit; onCopy: (text: string) => void; onLocateParent: (commit: RepositoryCommit) => void }) {
  return <>
    <MenuItem disabled={!commit} onClick={() => commit && onCopy(commit.id)}><Icon name="copy" size={14} />复制完整提交哈希</MenuItem>
    <MenuItem disabled={!commit} onClick={() => commit && onCopy(commit.summary)}><Icon name="copy" size={14} />复制提交说明</MenuItem>
    <MenuItem disabled={!commit?.parents.length} onClick={() => commit && onLocateParent(commit)}><Icon name="branch" size={14} />定位父提交</MenuItem>
  </>;
}

function BranchFilter({ branches, selection, onChange, title }: { branches: GraphBranch[]; selection: ReadonlySet<string> | null; onChange: (selection: ReadonlySet<string> | null) => void; title: string }) {
  const [open, setOpen] = useState(false);
  const allRef = useRef<HTMLInputElement>(null);
  const count = branches.filter(branch => selection === null || selection.has(branch.branch)).length;
  useEffect(() => { if (allRef.current) allRef.current.indeterminate = count > 0 && count < branches.length; }, [open, count, branches.length]);
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const inputs = [...event.currentTarget.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    const index = inputs.indexOf(document.activeElement as HTMLInputElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? inputs.length - 1 : event.key === 'ArrowDown' ? (index + 1) % inputs.length : (index - 1 + inputs.length) % inputs.length;
    event.preventDefault(); inputs[next]?.focus();
  }
  return <Popover label="分支筛选" open={open} onOpenChange={setOpen} placement="start" focusOnOpen="first" className="graph-branch-filter" trigger={<Button variant="quiet" className="repository-graph-branch-trigger" title={title} disabled={!branches.length} aria-haspopup="dialog" onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); } }}><span className="graph-branch-name">{title}</span><Icon name="down" size={10} /></Button>}>
    <div className="multi-filter-options" onKeyDown={navigate} onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <fieldset className="multi-filter-group"><legend>分支</legend>
        <label className="multi-filter-option"><input ref={allRef} type="checkbox" checked={selection === null} aria-checked={count > 0 && count < branches.length ? 'mixed' : selection === null} onChange={() => onChange(selection === null ? new Set() : null)} aria-label="全部分支" /><span className="filter-option-label">全部分支</span></label>
        {branches.map(branch => <label className="multi-filter-option" key={branch.branch} title={branch.tasks.map(task => `${task.remote ? '远端' : task.path || '本地分支'} · ${task.head}`).join('\n')}>
          <input type="checkbox" checked={selection === null || selection.has(branch.branch)} onChange={() => {
            const next = new Set(branches.filter(item => selection === null || selection.has(item.branch)).map(item => item.branch));
            if (next.has(branch.branch)) next.delete(branch.branch); else next.add(branch.branch);
            onChange(next.size === branches.length ? null : next);
          }} aria-label={`分支：${branch.branch}`} />
          <span className="filter-option-label"><span>{branch.branch}</span><small>{[branch.localHeads.length || branch.tasks.some(task => !task.remote) ? '本地' : '', branch.remoteHeads.length || branch.tasks.some(task => task.remote) ? '远端' : ''].filter(Boolean).join(' · ')}</small></span>
        </label>)}
      </fieldset>
    </div>
  </Popover>;
}

export function RepositoryGraph({ workspace, search, focusedTask, onSelectCommit, onSelectWorkingTask, emptyLabel }: { workspace: RepositoryWorkspace; search: string; focusedTask: string | null; onSelectCommit?: (id: string | null, previousId: string | null) => void; onSelectWorkingTask?: (taskId: string) => void; emptyLabel?: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [context, setContext] = useState<{ id: string; x: number; y: number } | null>(null);
  const [branchSelection, setBranchSelection] = useState<ReadonlySet<string> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const menuFocus = useRef<string | null>(null);
  const branches = useMemo(() => repositoryGraphBranches(workspace), [workspace]);
  const rows = useMemo(() => layoutCommitGraph(repositoryGraphCommits(workspace, branches, branchSelection)), [workspace, branches, branchSelection]);
  const byId = useMemo(() => new Map(rows.map((row, index) => [row.commit.id, index])), [rows]);
  const query = useMemo(() => parseCommitSearch(search), [search]);
  const matches = useMemo(() => rows.flatMap((row, index) => commitMatchesSearch(row.commit, query) ? [index] : []), [rows, query]);
  const matchSet = useMemo(() => new Set(matches), [matches]);
  const lanes = Math.max(1, ...rows.map(row => row.width));
  const task = workspace.tasks.find(item => item.id === focusedTask);
  const selectedBranches = branches.filter(branch => branchSelection === null || branchSelection.has(branch.branch));
  const branchName = branchSelection === null ? '全部分支' : selectedBranches.length === 1 ? selectedBranches[0].branch : selectedBranches.length ? `${selectedBranches.length} 个分支` : '未选择分支';
  const headIds = new Set(workspace.tasks.filter(item => item.path).map(item => item.head));
  const cursorId = cursor && byId.has(cursor) ? cursor : rows[0]?.commit.id;
  const rowHeight = 36;
  const choose = useCallback((id: string | null, toggle = false) => {
    const next = toggle && id === selected ? null : id;
    if (id) { setCursor(id); buttons.current.get(id)?.focus({ preventScroll: true }); buttons.current.get(id)?.closest('tr')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    const workingTask = rows.find(row => row.commit.id === next)?.commit.workingTask;
    setSelected(next); setFeedback(''); onSelectCommit?.(workingTask ? null : next, selected);
    if (workingTask) onSelectWorkingTask?.(workingTask.id);
  }, [selected, rows, onSelectCommit, onSelectWorkingTask]);
  function locateFromMenu(id: string) { menuFocus.current = id; choose(id); }
  function locateParent(commit: RepositoryCommit, fromMenu = false) {
    const parent = commit.parents[0];
    if (byId.has(parent)) { if (fromMenu) locateFromMenu(parent); else choose(parent); }
    else setFeedback('父提交不在当前已读取范围内。');
  }
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setFeedback('已复制'); }
    catch { setFeedback('无法访问剪贴板，请允许剪贴板权限后重试。'); }
  }
  function keyboard(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const key = event.key;
    const next = graphNavigationIndex(key, index, rows.length, Math.max(1, Math.floor((scrollRef.current?.clientHeight || rowHeight) / rowHeight)));
    if (next !== null) { event.preventDefault(); choose(rows[next].commit.id); }
    else if (key === 'Escape') { event.preventDefault(); choose(null); }
    else if (key === 'ArrowLeft') { event.preventDefault(); if (rows[index].commit.parents.length) locateParent(rows[index].commit); }
    else if (key === 'ArrowRight') { event.preventDefault(); const child = rows.slice(0, index).reverse().find(row => row.commit.parents.includes(rows[index].commit.id)); if (child) choose(child.commit.id); }
    else if (key === 'ContextMenu' || key === 'F10' && event.shiftKey) { event.preventDefault(); if (!rows[index].commit.workingTask) { const rect = event.currentTarget.getBoundingClientRect(); choose(rows[index].commit.id); setContext({ id: rows[index].commit.id, x: rect.left, y: rect.bottom }); } }
  }
  // Search navigation also works while the shared search field has focus.
  // This effect only subscribes to an external event; matches remain derived.
  useEffect(() => {
    if (!query.term) return;
    const navigate = (event: globalThis.KeyboardEvent) => {
      if (event.target instanceof Element && event.target.closest('[role="dialog"], [role="menu"]')) return;
      if (event.key === 'F3' || (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'g') {
        event.preventDefault();
        const index = nextGraphMatch(matches, byId.get(selected || '') ?? -1, event.shiftKey ? -1 : 1);
        if (index !== null) choose(rows[index].commit.id);
      }
    };
    window.addEventListener('keydown', navigate);
    return () => window.removeEventListener('keydown', navigate);
  }, [query.term, matches, byId, selected, rows, choose]);
  return <>
    <RepositoryColumnHeading title={branchName} disclosureLabel="分支图" icon="branch" controls="repository-graph-column" titleContent={
      <BranchFilter branches={branches} selection={branchSelection} title={branchName} onChange={selection => { setBranchSelection(selection); setContext(null); }} />
    } />
    {feedback && <p className="repository-data-note" role="status">{feedback}</p>}
    {!workspace.complete && !workspace.source && workspace.commits.length > 0 && <p className="repository-data-note">最近提交；完整分支关系等待服务更新。</p>}
    <div ref={scrollRef} className="repository-graph-scroll">
      {rows.length ? <table className="repository-graph-table" aria-label="提交历史"><colgroup><col style={{ width: lanes * 14 + 20 }} /><col /><col style={{ width: 66 }} /></colgroup><tbody>
        {rows.map(({ commit, lane, color, incoming, edges }, index) => {
          const workingTask = commit.workingTask;
          const isHead = headIds.has(commit.id);
          const missingParent = edges.some(edge => edge.boundary);
          const label = workingTask ? `${commit.summary} · ${workingTask.branch} · ${workingTask.path}` : `${commit.summary} · ${commit.author} · ${commit.id}${commit.refs.length ? ` · ${commit.refs.join(', ')}` : ''}${isHead ? ' · HEAD' : ''}${commit.unpublished ? ' · 未推送' : commit.localOnly ? ' · 本地提交' : ''}${missingParent ? ' · 父提交未读取' : ''}`;
          return <tr key={commit.id} data-commit-id={workingTask ? undefined : commit.id} data-working-task={workingTask?.id} className={`${selected === commit.id ? 'selected' : ''} ${query.term && !matchSet.has(index) ? 'graph-dimmed' : ''} ${task?.head === commit.id ? 'graph-task-head' : ''} ${workingTask ? 'graph-working-row' : ''}`} onClick={() => choose(commit.id, true)} onContextMenu={event => { event.preventDefault(); choose(commit.id); if (!workingTask) setContext({ id: commit.id, x: event.clientX, y: event.clientY }); }}>
            <td className="repository-graph-lane"><svg width={lanes * 14 + 14} height={rowHeight} viewBox={`0 0 ${lanes * 14 + 14} ${rowHeight}`} aria-hidden="true">
              {edges.map((edge, edgeIndex) => <path key={edgeIndex} d={edge.from === edge.to ? `M ${edge.from * 14 + 12} ${edge.node ? rowHeight / 2 : 0} V ${edge.boundary ? rowHeight - 3 : rowHeight}` : `M ${edge.from * 14 + 12} ${edge.node ? rowHeight / 2 : 0} C ${edge.from * 14 + 12} ${rowHeight * .78}, ${edge.to * 14 + 12} ${rowHeight * .78}, ${edge.to * 14 + 12} ${rowHeight}`} className={`graph-line graph-color-${edge.color}${edge.boundary ? ' graph-boundary' : ''}${workingTask && edge.node ? ' graph-working-edge' : ''}`} />)}
              {incoming && <path d={`M ${lane * 14 + 12} 0 V ${rowHeight / 2}`} className={`graph-line graph-color-${color}`} />}
              {isHead && <circle cx={lane * 14 + 12} cy={rowHeight / 2} r="6" className="graph-head-marker" />}
              <circle cx={lane * 14 + 12} cy={rowHeight / 2} r={workingTask || commit.parents.length > 1 ? 4 : 3.5} className={`graph-node graph-color-${color}${workingTask ? ' graph-working-node' : commit.parents.length > 1 ? ' graph-merge-node' : ''}`} />
            </svg></td>
            <td><button ref={element => { if (element) buttons.current.set(commit.id, element); else buttons.current.delete(commit.id); }} className="repository-graph-description" tabIndex={cursorId === commit.id ? 0 : -1} onFocus={() => setCursor(commit.id)} onKeyDown={event => keyboard(event, index)} aria-pressed={selected === commit.id} aria-label={label} title={`${label}${workingTask ? '' : `\n${new Date(commit.time).toLocaleString()}`}\n↑ ↓ 导航 · ← 父提交 · → 子提交 · Esc 取消`}>
              <strong><GraphText text={commit.summary} term={query.term} /></strong>
              <span className="graph-row-secondary">{workingTask ? <span className="graph-working-identity" title={workingTask.path || undefined}><GraphText text={workingTask.branch} term={query.term} /><span> · 工作目录</span></span> : <code><GraphText text={commit.id.slice(0, 8)} term={query.term} /></code>}{commit.localOnly && <span className="commit-ref graph-local-ref" title={commit.unpublished ? '尚未在当前读取的远端分支中出现' : '本地历史中的提交，远端推送状态尚未确认'}>{commit.unpublished ? '未推送' : '本地提交'}</span>}{isHead && <span className="commit-ref graph-head-ref" title="本地工作目录的 HEAD">HEAD</span>}{commit.refs.length > 0 && <span className="commit-ref-list">{commit.refs.map(ref => <span className={`commit-ref graph-color-${color}${ref.startsWith('origin/') || ref.startsWith('refs/remotes/') ? ' graph-remote-ref' : ''}`} key={ref} title={ref}><Icon name={ref.startsWith('origin/') || ref.startsWith('refs/remotes/') ? 'download' : 'branch'} size={10} /><span className="commit-ref-name"><GraphText text={ref.replace(/^refs\/(heads|remotes)\//, '')} term={query.term} /></span></span>)}</span>}{missingParent && <span className="graph-boundary-label" title="真实父提交不在当前读取范围内，不连接相邻提交">…</span>}</span>
            </button></td>
            <td className="repository-graph-byline" title={workingTask?.path || commit.author}><span>{workingTask ? '本地' : commit.author}</span>{workingTask ? <span>未提交</span> : <time dateTime={commit.time} title={new Date(commit.time).toLocaleString()}>{new Date(commit.time).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}</time>}</td>
          </tr>;
        })}
      </tbody></table> : <div className="repository-column-empty"><Icon name="branch" size={28} /><p>{branchSelection !== null ? selectedBranches.length ? '所选分支在当前读取范围内尚无提交' : '选择分支以显示提交' : emptyLabel || (workspace.complete ? '仓库尚无提交' : '分支图读取等待服务更新')}</p></div>}
    </div>
    {context && byId.has(context.id) && <div className="repository-graph-context" style={{ left: context.x, top: context.y }}><Menu label="提交操作" open placement="start" focusOnOpen="first" onOpenChange={open => { if (!open) { const id = menuFocus.current || context.id; menuFocus.current = null; setContext(null); requestAnimationFrame(() => buttons.current.get(id)?.focus({ preventScroll: true })); } }} trigger={<button className="graph-context-anchor" aria-label="提交操作" />}><CommitActions commit={rows[byId.get(context.id)!]?.commit} onCopy={text => void copy(text)} onLocateParent={commit => locateParent(commit, true)} /></Menu></div>}
  </>;
}
