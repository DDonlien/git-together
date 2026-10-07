import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Button, Icon, Menu, MenuItem } from './ui';
import { RepositoryColumnHeading } from './RepositoryColumnHeading';
import { commitMatchesSearch, graphNavigationIndex, layoutCommitGraph, nextGraphMatch, parseCommitSearch } from './commit-graph';
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

export function RepositoryGraph({ workspace, search, focusedTask, defaultBranch, onSelectCommit, emptyLabel }: { workspace: RepositoryWorkspace; search: string; focusedTask: string | null; defaultBranch?: string; onSelectCommit?: (id: string | null, previousId: string | null) => void; emptyLabel?: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [context, setContext] = useState<{ id: string; x: number; y: number } | null>(null);
  const [branchChoice, setBranchChoice] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const menuFocus = useRef<string | null>(null);
  const rows = useMemo(() => layoutCommitGraph(workspace.commits), [workspace.commits]);
  const byId = useMemo(() => new Map(rows.map((row, index) => [row.commit.id, index])), [rows]);
  const query = useMemo(() => parseCommitSearch(search), [search]);
  const matches = useMemo(() => rows.flatMap((row, index) => commitMatchesSearch(row.commit, query) ? [index] : []), [rows, query]);
  const matchSet = useMemo(() => new Set(matches), [matches]);
  const lanes = Math.max(1, ...rows.map(row => row.width));
  const task = workspace.tasks.find(item => item.id === focusedTask);
  const branchTask = workspace.tasks.find(item => item.id === branchChoice) || task || workspace.tasks.find(item => item.branch === defaultBranch) || workspace.tasks[0];
  const branchName = branchTask?.branch || defaultBranch || '未读取分支';
  const headIds = new Set(workspace.tasks.filter(item => item.path).map(item => item.head));
  const cursorId = cursor && byId.has(cursor) ? cursor : rows[0]?.commit.id;
  const rowHeight = 36;
  const choose = useCallback((id: string | null, toggle = false) => {
    const next = toggle && id === selected ? null : id;
    if (id) { setCursor(id); buttons.current.get(id)?.focus({ preventScroll: true }); buttons.current.get(id)?.closest('tr')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    setSelected(next); setFeedback(''); onSelectCommit?.(next, selected);
  }, [selected, onSelectCommit]);
  function locateFromMenu(id: string) { menuFocus.current = id; choose(id); }
  function closeNavigationMenu(open: boolean) {
    if (!open && menuFocus.current) { const id = menuFocus.current; menuFocus.current = null; requestAnimationFrame(() => buttons.current.get(id)?.focus({ preventScroll: true })); }
  }
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
    else if (key === 'ContextMenu' || key === 'F10' && event.shiftKey) { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); choose(rows[index].commit.id); setContext({ id: rows[index].commit.id, x: rect.left, y: rect.bottom }); }
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
      <Menu label={`选择分支：${branchName}`} placement="start" onOpenChange={closeNavigationMenu} trigger={<Button variant="quiet" className="repository-graph-branch-trigger" title={branchName} disabled={!workspace.tasks.length}><span className="graph-branch-name">{branchName}</span><Icon name="down" size={10} /></Button>}>
        {workspace.tasks.map(item => <MenuItem key={item.id} disabled={!byId.has(item.head)} aria-current={branchTask?.id === item.id ? 'true' : undefined} onClick={() => { setBranchChoice(item.id); locateFromMenu(item.head); }} title={byId.has(item.head) ? `${item.branch} · ${item.remote ? '远端' : item.path || '本地分支'} · ${item.head}` : '这个分支头不在当前已读取范围内'}><Icon name={item.remote ? 'download' : 'branch'} size={14} /><span className="graph-menu-branch">{item.branch}<small>{item.remote ? '远端' : item.path ? '本地工作目录' : '本地分支'} · {item.head.slice(0, 8)}</small></span>{branchTask?.id === item.id && <Icon name="check" size={14} />}</MenuItem>)}
      </Menu>
    } />
    {feedback && <p className="repository-data-note" role="status">{feedback}</p>}
    {!workspace.complete && !workspace.source && workspace.commits.length > 0 && <p className="repository-data-note">最近提交；完整分支关系等待服务更新。</p>}
    <div ref={scrollRef} className="repository-graph-scroll">
      {rows.length ? <table className="repository-graph-table" aria-label="提交历史"><colgroup><col style={{ width: lanes * 14 + 20 }} /><col /><col style={{ width: 66 }} /></colgroup><tbody>
        {rows.map(({ commit, lane, color, incoming, edges }, index) => {
          const isHead = headIds.has(commit.id);
          const missingParent = edges.some(edge => edge.boundary);
          const label = `${commit.summary} · ${commit.author} · ${commit.id}${commit.refs.length ? ` · ${commit.refs.join(', ')}` : ''}${isHead ? ' · HEAD' : ''}${missingParent ? ' · 父提交未读取' : ''}`;
          return <tr key={commit.id} data-commit-id={commit.id} className={`${selected === commit.id ? 'selected' : ''} ${query.term && !matchSet.has(index) ? 'graph-dimmed' : ''} ${task?.head === commit.id ? 'graph-task-head' : ''}`} onClick={() => choose(commit.id, true)} onContextMenu={event => { event.preventDefault(); choose(commit.id); setContext({ id: commit.id, x: event.clientX, y: event.clientY }); }}>
            <td className="repository-graph-lane"><svg width={lanes * 14 + 14} height={rowHeight} viewBox={`0 0 ${lanes * 14 + 14} ${rowHeight}`} aria-hidden="true">
              {edges.map((edge, edgeIndex) => <path key={edgeIndex} d={edge.from === edge.to ? `M ${edge.from * 14 + 12} ${edge.node ? rowHeight / 2 : 0} V ${edge.boundary ? rowHeight - 3 : rowHeight}` : `M ${edge.from * 14 + 12} ${edge.node ? rowHeight / 2 : 0} C ${edge.from * 14 + 12} ${rowHeight * .78}, ${edge.to * 14 + 12} ${rowHeight * .78}, ${edge.to * 14 + 12} ${rowHeight}`} className={`graph-line graph-color-${edge.color}${edge.boundary ? ' graph-boundary' : ''}`} />)}
              {incoming && <path d={`M ${lane * 14 + 12} 0 V ${rowHeight / 2}`} className={`graph-line graph-color-${color}`} />}
              {isHead && <circle cx={lane * 14 + 12} cy={rowHeight / 2} r="6" className="graph-head-marker" />}
              <circle cx={lane * 14 + 12} cy={rowHeight / 2} r={commit.parents.length > 1 ? 4 : 3.5} className={`graph-node graph-color-${color}${commit.parents.length > 1 ? ' graph-merge-node' : ''}`} />
            </svg></td>
            <td><button ref={element => { if (element) buttons.current.set(commit.id, element); else buttons.current.delete(commit.id); }} className="repository-graph-description" tabIndex={cursorId === commit.id ? 0 : -1} onFocus={() => setCursor(commit.id)} onKeyDown={event => keyboard(event, index)} aria-pressed={selected === commit.id} aria-label={label} title={`${label}\n${new Date(commit.time).toLocaleString()}\n↑ ↓ 导航 · ← 父提交 · → 子提交 · Esc 取消`}>
              <strong><GraphText text={commit.summary} term={query.term} /></strong>
              <span className="graph-row-secondary"><code><GraphText text={commit.id.slice(0, 8)} term={query.term} /></code>{isHead && <span className="commit-ref graph-head-ref" title="本地工作目录的 HEAD">HEAD</span>}{commit.refs.length > 0 && <span className="commit-ref-list">{commit.refs.map(ref => <span className={`commit-ref graph-color-${color}${ref.startsWith('origin/') || ref.startsWith('refs/remotes/') ? ' graph-remote-ref' : ''}`} key={ref} title={ref}><Icon name={ref.startsWith('origin/') || ref.startsWith('refs/remotes/') ? 'download' : 'branch'} size={10} /><span className="commit-ref-name"><GraphText text={ref.replace(/^refs\/(heads|remotes)\//, '')} term={query.term} /></span></span>)}</span>}{missingParent && <span className="graph-boundary-label" title="真实父提交不在当前读取范围内，不连接相邻提交">…</span>}</span>
            </button></td>
            <td className="repository-graph-byline" title={commit.author}><span>{commit.author}</span><time dateTime={commit.time} title={new Date(commit.time).toLocaleString()}>{new Date(commit.time).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}</time></td>
          </tr>;
        })}
      </tbody></table> : <div className="repository-column-empty"><Icon name="branch" size={28} /><p>{emptyLabel || (workspace.complete ? focusedTask ? '当前读取范围内没有这个任务的提交' : '仓库尚无提交' : '分支图读取等待服务更新')}</p></div>}
    </div>
    {context && <div className="repository-graph-context" style={{ left: context.x, top: context.y }}><Menu label="提交操作" open placement="start" focusOnOpen="first" onOpenChange={open => { if (!open) { const id = menuFocus.current || context.id; menuFocus.current = null; setContext(null); requestAnimationFrame(() => buttons.current.get(id)?.focus({ preventScroll: true })); } }} trigger={<button className="graph-context-anchor" aria-label="提交操作" />}><CommitActions commit={rows[byId.get(context.id)!]?.commit} onCopy={text => void copy(text)} onLocateParent={commit => locateParent(commit, true)} /></Menu></div>}
  </>;
}
