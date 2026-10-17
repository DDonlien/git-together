import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Button, Icon, Menu, MenuItem, Popover } from './ui';
import { RepositoryColumnHeading } from './RepositoryColumnHeading';
import { commitMatchesSearch, graphNavigationIndex, graphRowHeight, graphVisibleWindow, layoutCommitGraph, nextGraphMatch, parseCommitSearch, repositoryGraphAuthors, repositoryGraphBranches, repositoryGraphCommits } from './commit-graph';
import type { RepositoryWorkspace } from './repository-model';
import type { GraphCommit } from './commit-graph';
import { graphActionLabels, type GraphAction } from './graph-operation-model';

// Reuse the browser's locale/timezone formatters while scrolling between rows.
const graphTimeFormat = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
const graphDateFormat = new Intl.DateTimeFormat(undefined, { month: 'numeric', day: 'numeric' });

function GraphText({ text, term }: { text: string; term: string }) {
  const at = term ? text.toLowerCase().indexOf(term) : -1;
  return at < 0 ? <>{text}</> : <>{text.slice(0, at)}<mark>{text.slice(at, at + term.length)}</mark>{text.slice(at + term.length)}</>;
}

function CommitActions({ commit, onCopy, onLocateParent, onAction, onOpenCommit, onLocateWorktree }: { commit?: GraphCommit; onCopy: (text: string) => void; onLocateParent: (commit: GraphCommit) => void; onAction?: (action: GraphAction, commit: GraphCommit) => void; onOpenCommit?: (commit: GraphCommit) => void; onLocateWorktree?: (commit: GraphCommit) => void }) {
  const committed = !!commit && !commit.workingTask;
  return <>
    <div className="graph-menu-group-label">标准 Git 操作</div>
    {(['compare', 'branch', 'tag', 'merge', 'rebase', 'cherry-pick', 'revert', 'reset', 'abort'] as const).map(action => <MenuItem key={action} disabled={!onAction || !commit || !committed && action !== 'abort'} onClick={() => commit && onAction?.(action, commit)}><Icon name={action === 'branch' || action === 'merge' || action === 'rebase' ? 'branch' : action === 'compare' ? 'code' : action === 'abort' ? 'close' : 'commit'} size={14} />{graphActionLabels[action]}</MenuItem>)}
    <div className="graph-menu-group-label">Git Together · 非 AI</div>
    <MenuItem disabled={!onAction || !committed} onClick={() => commit && onAction?.('worktree', commit)}><Icon name="folder" size={14} />创建并关联工作目录</MenuItem>
    <MenuItem disabled={!onLocateWorktree || !commit} onClick={() => commit && onLocateWorktree?.(commit)}><Icon name="folder" size={14} />定位关联工作目录</MenuItem>
    <MenuItem disabled={!onOpenCommit || !committed} onClick={() => commit && onOpenCommit?.(commit)}><Icon name="external" size={14} />在远端打开提交</MenuItem>
    <MenuItem disabled={!committed} onClick={() => commit && onCopy(commit.id)}><Icon name="copy" size={14} />复制完整提交哈希</MenuItem>
    <MenuItem disabled={!committed} onClick={() => commit && onCopy(commit.summary)}><Icon name="copy" size={14} />复制提交说明</MenuItem>
    <MenuItem disabled={!committed || !commit?.parents.length} onClick={() => commit && onLocateParent(commit)}><Icon name="branch" size={14} />定位父提交</MenuItem>
    <div className="graph-menu-group-label">AI 操作</div>
    <MenuItem disabled={!onAction || !commit} onClick={() => commit && onAction?.('ai-sync', commit)}><Icon name="sparkle" size={14} />同步到最新</MenuItem>
  </>;
}

type GraphFilterOption = { value: string; label: string; detail?: string; title?: string };

function GraphFilter({ label, options, selection, onChange, title }: { label: string; options: GraphFilterOption[]; selection: ReadonlySet<string> | null; onChange: (selection: ReadonlySet<string> | null) => void; title: string }) {
  const [open, setOpen] = useState(false);
  const allRef = useRef<HTMLInputElement>(null);
  const count = options.filter(option => selection === null || selection.has(option.value)).length;
  const allSelected = selection === null || count === options.length && options.length > 0;
  useEffect(() => { if (allRef.current) allRef.current.indeterminate = count > 0 && count < options.length; }, [open, count, options.length]);
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const inputs = [...event.currentTarget.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    if (!inputs.length) return;
    const index = inputs.indexOf(document.activeElement as HTMLInputElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? inputs.length - 1 : event.key === 'ArrowDown' ? (index + 1) % inputs.length : (index - 1 + inputs.length) % inputs.length;
    event.preventDefault(); inputs[next]?.focus();
  }
  return <Popover label={`${label}筛选`} open={open} onOpenChange={setOpen} placement="start" focusOnOpen="first" className="graph-branch-filter" trigger={<Button variant="quiet" className="repository-graph-branch-trigger" title={`${label}：${title}`} disabled={!options.length} aria-haspopup="dialog" onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); } }}><span className="graph-branch-name">{title}</span><Icon name="down" size={10} /></Button>}>
    <div className="multi-filter-options" onKeyDown={navigate} onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <fieldset className="multi-filter-group"><legend>{label}</legend>
        <label className="multi-filter-option"><input ref={allRef} type="checkbox" checked={allSelected} aria-checked={count > 0 && count < options.length ? 'mixed' : allSelected} onChange={() => onChange(allSelected ? new Set() : null)} aria-label={`全部${label}`} /><span className="filter-option-label">全部{label}</span></label>
        {options.map(option => <label className="multi-filter-option" key={option.value} title={option.title}>
          <input type="checkbox" checked={selection === null || selection.has(option.value)} onChange={() => {
            const next = new Set(selection ?? options.map(item => item.value));
            if (next.has(option.value)) next.delete(option.value); else next.add(option.value);
            onChange(options.every(item => next.has(item.value)) ? null : next);
          }} aria-label={`${label}：${option.label}`} />
          <span className="filter-option-label"><span>{option.label}</span>{option.detail && <small>{option.detail}</small>}</span>
        </label>)}
      </fieldset>
    </div>
  </Popover>;
}

export function RepositoryGraph({ workspace, search, focusedTask, onSelectCommit, onSelectWorkingTask, onBranchFilterChange, defaultHiddenBranches, emptyLabel, onAction, onOpenCommit, onLocateWorktree, loading = false, historyLoadingBranches = new Set(), historyErrorsByBranch = {}, onLoadMoreHistory }: { workspace: RepositoryWorkspace; search: string; focusedTask: string | null; onSelectCommit?: (id: string | null, previousId: string | null) => void; onSelectWorkingTask?: (taskId: string) => void; onBranchFilterChange?: (selection: ReadonlySet<string> | null) => void; defaultHiddenBranches?: ReadonlySet<string>; emptyLabel?: string; onAction?: (action: GraphAction, commit: GraphCommit) => void; onOpenCommit?: (commit: GraphCommit) => void; onLocateWorktree?: (commit: GraphCommit) => void; loading?: boolean; historyLoadingBranches?: ReadonlySet<string>; historyErrorsByBranch?: Record<string, string>; onLoadMoreHistory?: (branches: readonly string[], retry?: boolean) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [context, setContext] = useState<{ id: string; x: number; y: number } | null>(null);
  const [branchSelection, setBranchSelection] = useState<ReadonlySet<string> | 'all' | null>(null);
  const [authorSelection, setAuthorSelection] = useState<ReadonlySet<string> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const menuFocus = useRef<string | null>(null);
  const requestedFocus = useRef<string | null>(null);
  const branches = useMemo(() => repositoryGraphBranches(workspace), [workspace]);
  const authors = useMemo(() => repositoryGraphAuthors(workspace), [workspace]);
  const branchOptions = useMemo(() => branches.map(branch => ({ value: branch.branch, label: branch.branch, title: branch.tasks.map(task => `${task.remote ? '远端' : task.path || '本地分支'} · ${task.head}`).join('\n'), detail: [branch.localHeads.length || branch.tasks.some(task => !task.remote) ? '本地' : '', branch.remoteHeads.length || branch.tasks.some(task => task.remote) ? '远端' : ''].filter(Boolean).join(' · ') })), [branches]);
  const authorOptions = useMemo(() => authors.map(author => ({ value: author, label: author || '未记录提交者' })), [authors]);
  const defaultSelection = useMemo(() => defaultHiddenBranches?.size ? new Set(branches.filter(branch => !defaultHiddenBranches.has(branch.branch)).map(branch => branch.branch)) : null, [branches, defaultHiddenBranches]);
  const effectiveSelection = branchSelection === 'all' ? null : branchSelection || defaultSelection;
  const rows = useMemo(() => layoutCommitGraph(repositoryGraphCommits(workspace, branches, effectiveSelection, authorSelection)), [workspace, branches, effectiveSelection, authorSelection]);
  const [windowRange, setWindowRange] = useState(() => graphVisibleWindow(rows.length, 0, 0));
  const range = { start: Math.min(windowRange.start, rows.length), end: Math.min(windowRange.end, rows.length), firstVisible: Math.min(windowRange.firstVisible, Math.max(0, rows.length - 1)) };
  useLayoutEffect(() => {
    const scroll = scrollRef.current!;
    let frame = 0;
    const measure = () => {
      frame = 0;
      // A collapsed column keeps its last viewport until it becomes visible again.
      if (!scroll.clientHeight) return;
      const next = graphVisibleWindow(rows.length, scroll.scrollTop, scroll.clientHeight);
      setWindowRange(current => current.start === next.start && current.end === next.end && current.firstVisible === next.firstVisible ? current : next);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    scroll.addEventListener('scroll', schedule, { passive: true }); observer.observe(scroll); measure();
    return () => { scroll.removeEventListener('scroll', schedule); observer.disconnect(); cancelAnimationFrame(frame); };
  }, [rows.length]);
  useLayoutEffect(() => {
    if (requestedFocus.current) { buttons.current.get(requestedFocus.current)?.focus({ preventScroll: true }); requestedFocus.current = null; }
  });
  const byId = useMemo(() => new Map(rows.map((row, index) => [row.commit.id, index])), [rows]);
  const query = useMemo(() => parseCommitSearch(search), [search]);
  const matches = useMemo(() => rows.flatMap((row, index) => commitMatchesSearch(row.commit, query) ? [index] : []), [rows, query]);
  const matchSet = useMemo(() => new Set(matches), [matches]);
  const lanes = useMemo(() => Math.max(1, ...rows.map(row => row.width)), [rows]);
  const task = workspace.tasks.find(item => item.id === focusedTask);
  const selectedBranches = branches.filter(branch => effectiveSelection === null || effectiveSelection.has(branch.branch));
  const loadMoreBranches = selectedBranches.filter(branch => workspace.tasks.some(item => item.remote && item.branch === branch.branch && item.historyHasMore));
  const loadingMore = loadMoreBranches.some(branch => historyLoadingBranches.has(branch.branch));
  const historyError = loadMoreBranches.map(branch => historyErrorsByBranch[branch.branch] ? `${branch.branch}：${historyErrorsByBranch[branch.branch]}` : '').filter(Boolean).join(' ');
  const loadMoreKey = loadMoreBranches.map(branch => branch.branch).join('\n');
  const branchName = effectiveSelection === null || selectedBranches.length === branches.length && branches.length > 0 ? '全部分支' : selectedBranches.length === 1 ? selectedBranches[0].branch : selectedBranches.length ? `${selectedBranches.length} 个分支` : '未选择分支';
  const selectedAuthors = authors.filter(author => authorSelection === null || authorSelection.has(author));
  const authorName = authorSelection === null ? '提交者' : selectedAuthors.length === 1 ? selectedAuthors[0] || '未记录提交者' : selectedAuthors.length ? `${selectedAuthors.length} 位提交者` : '未选择提交者';
  const emptyGraphLabel = effectiveSelection !== null && !selectedBranches.length ? '选择分支以显示提交' : authorSelection !== null ? selectedAuthors.length ? '所选分支中没有符合提交者筛选的已读取提交' : '选择提交者以显示提交' : effectiveSelection !== null ? '所选分支在当前读取范围内尚无提交' : emptyLabel || (workspace.complete ? '仓库尚无提交' : '分支图读取等待服务更新');
  const headIds = useMemo(() => new Set(workspace.tasks.filter(item => item.path).map(item => item.head)), [workspace.tasks]);
  const cursorId = cursor && byId.has(cursor) ? cursor : rows[0]?.commit.id;
  const tabStopIndex = cursorId && byId.get(cursorId)! >= range.start && byId.get(cursorId)! < range.end ? byId.get(cursorId)! : range.firstVisible;
  const rowHeight = graphRowHeight;
  const changeBranches = useCallback((selection: ReadonlySet<string> | null) => { setBranchSelection(selection === null ? 'all' : selection); onBranchFilterChange?.(selection); setContext(null); }, [onBranchFilterChange]);
  const choose = useCallback((id: string | null, toggle = false) => {
    const next = toggle && id === selected ? null : id;
    if (id) {
      setCursor(id); requestedFocus.current = id;
      const scroll = scrollRef.current!, top = byId.get(id)! * rowHeight;
      if (top < scroll.scrollTop) scroll.scrollTop = top;
      else if (top + rowHeight > scroll.scrollTop + scroll.clientHeight) scroll.scrollTop = top + rowHeight - scroll.clientHeight;
      setWindowRange(graphVisibleWindow(rows.length, scroll.scrollTop, scroll.clientHeight));
    }
    const workingTask = rows.find(row => row.commit.id === next)?.commit.workingTask;
    setSelected(next); setFeedback(''); onSelectCommit?.(workingTask ? null : next, selected);
    if (workingTask) onSelectWorkingTask?.(workingTask.id);
  }, [selected, rows, byId, onSelectCommit, onSelectWorkingTask]);
  function locateFromMenu(id: string) { menuFocus.current = id; choose(id); }
  function locateParent(commit: GraphCommit, fromMenu = false) {
    const parent = commit.parents[0];
    if (byId.has(parent)) { if (fromMenu) locateFromMenu(parent); else choose(parent); }
    else setFeedback('父提交不在当前筛选或已读取范围内。');
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
    else if (key === 'ContextMenu' || key === 'F10' && event.shiftKey) { event.preventDefault(); { const rect = event.currentTarget.getBoundingClientRect(); choose(rows[index].commit.id); setContext({ id: rows[index].commit.id, x: rect.left, y: rect.bottom }); } }
  }
  useEffect(() => {
    const target = loadMoreRef.current, root = scrollRef.current;
    if (!target || !root || !loadMoreBranches.length || loadingMore || !onLoadMoreHistory || query.term || authorSelection !== null || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) onLoadMoreHistory(loadMoreBranches.map(branch => branch.branch));
    }, { root, rootMargin: '240px 0px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [loadMoreKey, loadingMore, onLoadMoreHistory, query.term, authorSelection]);
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
      <span className="repository-graph-filters">
        <GraphFilter label="分支" options={branchOptions} selection={effectiveSelection !== null && selectedBranches.length === branches.length ? null : effectiveSelection} title={branchName} onChange={selection => { setBranchSelection(selection === null ? 'all' : selection); onBranchFilterChange?.(selection); setContext(null); }} />
        <GraphFilter label="提交者" options={authorOptions} selection={authorSelection} title={authorName} onChange={selection => { setAuthorSelection(selection); setContext(null); }} />
      </span>
    } />
    {feedback && <p className="repository-data-note" role="status">{feedback}</p>}
    {authorSelection !== null && rows.length > 0 && rows.every(row => row.commit.workingTask) && <p className="repository-data-note" role="status">{emptyGraphLabel}；以下仅显示未提交更改。</p>}
    {!workspace.complete && !workspace.source && workspace.commits.length > 0 && <p className="repository-data-note">最近提交；完整分支关系等待服务更新。</p>}
    <div ref={scrollRef} className="repository-graph-scroll">
      {rows.length ? <table className="repository-graph-table" aria-label="提交历史" aria-rowcount={rows.length}><colgroup><col style={{ width: lanes * 14 + 20 }} /><col /><col style={{ width: 78 }} /></colgroup><tbody>
        <tr className="repository-graph-spacer" aria-hidden="true"><td colSpan={3} style={{ height: range.start * rowHeight }} /></tr>
        {rows.slice(range.start, range.end).map(({ commit, lane, color, incoming, incomingLocal, edges }, offset) => {
          const index = range.start + offset;
          const workingTask = commit.workingTask;
          const time = workingTask ? null : new Date(commit.time), timeLabel = time ? graphTimeFormat.format(time) : '';
          const isHead = headIds.has(commit.id);
          const missingParent = edges.some(edge => edge.boundary);
          const parentBoundaryLabel = '父提交在筛选外或未读取';
          const label = workingTask ? `${commit.summary} · ${workingTask.branch} · ${workingTask.path}` : `${commit.summary} · ${commit.author} · ${commit.id}${commit.refs.length ? ` · ${commit.refs.join(', ')}` : ''}${isHead ? ' · HEAD' : ''}${commit.unpublished ? ' · 未推送' : commit.localOnly ? ' · 本地提交' : ''}${missingParent ? ` · ${parentBoundaryLabel}` : ''}`;
          return <tr key={commit.id} aria-rowindex={index + 1} data-commit-id={workingTask ? undefined : commit.id} data-working-task={workingTask?.id} className={`${selected === commit.id ? 'selected' : ''} ${query.term && !matchSet.has(index) ? 'graph-dimmed' : ''} ${task?.head === commit.id ? 'graph-task-head' : ''} ${workingTask ? 'graph-working-row' : ''}`} onClick={() => choose(commit.id, true)} onContextMenu={event => { event.preventDefault(); choose(commit.id); setContext({ id: commit.id, x: event.clientX, y: event.clientY }); }}>
            <td className="repository-graph-lane"><svg width={lanes * 14 + 14} height={rowHeight} viewBox={`0 0 ${lanes * 14 + 14} ${rowHeight}`} aria-hidden="true">
              {edges.map((edge, edgeIndex) => <path key={edgeIndex} d={edge.from === edge.to ? `M ${edge.from * 14 + 12} ${edge.node ? rowHeight / 2 : 0} V ${edge.boundary ? rowHeight - 3 : rowHeight}` : `M ${edge.from * 14 + 12} ${edge.node ? rowHeight / 2 : 0} C ${edge.from * 14 + 12} ${rowHeight * .78}, ${edge.to * 14 + 12} ${rowHeight * .78}, ${edge.to * 14 + 12} ${rowHeight}`} className={`graph-line graph-color-${edge.color}${edge.boundary ? ' graph-boundary' : ''}${edge.local ? ' graph-local-edge' : ''}`} />)}
              {incoming && <path d={`M ${lane * 14 + 12} 0 V ${rowHeight / 2}`} className={`graph-line graph-color-${color}${incomingLocal ? ' graph-local-edge' : ''}`} />}
              {isHead && !commit.unpublished && <circle cx={lane * 14 + 12} cy={rowHeight / 2} r="6" className="graph-head-marker" />}
              <circle cx={lane * 14 + 12} cy={rowHeight / 2} r={workingTask || commit.unpublished || commit.parents.length > 1 ? 4 : 3.5} className={`graph-node graph-color-${color}${workingTask ? ' graph-working-node' : commit.unpublished ? ' graph-unpublished-node' : commit.parents.length > 1 ? ' graph-merge-node' : ''}`} />
            </svg></td>
            <td><button ref={element => { if (element) buttons.current.set(commit.id, element); else buttons.current.delete(commit.id); }} className="repository-graph-description" tabIndex={tabStopIndex === index ? 0 : -1} onFocus={() => setCursor(commit.id)} onKeyDown={event => keyboard(event, index)} aria-pressed={selected === commit.id} aria-label={label} title={`${label}${workingTask ? '' : `\n${timeLabel}`}\n↑ ↓ 导航 · ← 父提交 · → 子提交 · Esc 取消`}>
              <strong><GraphText text={commit.summary} term={query.term} /></strong>
              <span className="graph-row-secondary">{workingTask ? <span className="graph-working-identity" title={workingTask.path || undefined}><GraphText text={workingTask.branch} term={query.term} /><span> · 工作目录</span></span> : <code><GraphText text={commit.id.slice(0, 8)} term={query.term} /></code>}{commit.localOnly && <span className="commit-ref graph-local-ref" title={commit.unpublished ? '尚未在当前读取的远端分支中出现' : '本地历史中的提交，远端推送状态尚未确认'}>{commit.unpublished ? '未推送' : '本地提交'}</span>}{isHead && <span className="commit-ref graph-head-ref" title="本地工作目录的 HEAD">HEAD</span>}{commit.refs.length > 0 && <span className="commit-ref-list">{commit.refs.map(ref => <span className={`commit-ref graph-color-${color}${ref.startsWith('origin/') || ref.startsWith('refs/remotes/') ? ' graph-remote-ref' : ''}`} key={ref} title={ref}><Icon name={ref.startsWith('origin/') || ref.startsWith('refs/remotes/') ? 'download' : 'branch'} size={10} /><span className="commit-ref-name"><GraphText text={ref.replace(/^refs\/(heads|remotes)\//, '')} term={query.term} /></span></span>)}</span>}{missingParent && <span className="graph-boundary-label" title={`${parentBoundaryLabel}，不连接相邻提交`}>…</span>}</span>
            </button></td>
            <td className="repository-graph-byline" title={workingTask?.path || commit.author}><span>{workingTask ? '本地' : commit.author}</span>{workingTask ? <span>未提交</span> : <time dateTime={commit.time} title={timeLabel}>{graphDateFormat.format(time!)}</time>}</td>
          </tr>;
        })}
        <tr className="repository-graph-spacer" aria-hidden="true"><td colSpan={3} style={{ height: (rows.length - range.end) * rowHeight }} /></tr>
      </tbody></table> : <div className="repository-column-empty"><Icon name="branch" size={28} /><p>{emptyGraphLabel}</p></div>}
      {!!loadMoreBranches.length && <div ref={loadMoreRef} className="repository-history-more">
        {loadingMore && <span role="status">正在加载更早提交…</span>}
        {!!historyError && <span role="alert">{historyError}</span>}
        {!loadingMore && <Button variant="quiet" onClick={() => onLoadMoreHistory?.(loadMoreBranches.map(branch => branch.branch), true)}>{historyError ? '重试读取更早提交' : '加载更早提交'}</Button>}
      </div>}
    </div>
    {loading && <div className="repository-graph-loading" role="status"><Icon name="spinner" className="spin" size={14} /><span>正在加载…</span></div>}
    {context && byId.has(context.id) && <div className="repository-graph-context" style={{ left: context.x, top: context.y }}><Menu label="提交操作" open placement="start" focusOnOpen="first" onOpenChange={open => { if (!open) { const id = menuFocus.current || context.id; menuFocus.current = null; setContext(null); requestAnimationFrame(() => buttons.current.get(id)?.focus({ preventScroll: true })); } }} trigger={<button className="graph-context-anchor" aria-label="提交操作" />}><CommitActions commit={rows[byId.get(context.id)!]?.commit} onCopy={text => void copy(text)} onLocateParent={commit => locateParent(commit, true)} onAction={onAction} onOpenCommit={onOpenCommit} onLocateWorktree={onLocateWorktree} /></Menu></div>}
  </>;
}
