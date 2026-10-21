import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { Button, Icon, IconButton, Menu, MenuItem } from './ui';
import { SearchBar } from './material-inputs';
import { importAPI } from './import-api';
import { FileTypeIcon } from './FileTypeIcon';
import { FileOperationDialog } from './FileOperationDialog';
import { fileChangeKind, type FileTreeChange } from './file-tree';
import type { FileEntry, FileOperationInput } from './file-operation-model';
import type { RepositoryTask } from './repository-model';

type Entry = FileEntry & { missing?: boolean };
type Clipboard = { repositoryId: string; taskId: string; paths: string[]; operation: 'copy' | 'move' };
let clipboard: Clipboard | null = null;
const clipboardEvent = 'gittogether:file-clipboard', dropEvent = 'gittogether:tree-drop';
const compare = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const parent = (path: string) => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
const directoryIsReachable = (path: string, directories: Record<string, Entry[]>) => {
  let current = '';
  for (const segment of path.split('/')) {
    const next = current ? `${current}/${segment}` : segment;
    if (!directories[current]?.some(entry => entry.path === next && entry.directory)) return false;
    current = next;
  }
  return !!path;
};
const letters = { added: 'A', modified: 'M', deleted: 'D' };

export function LocalFileTree({ task, repositoryId, enabled, selected, onSelect, onChanged, changes, openFile }: { task: RepositoryTask; repositoryId: string; enabled: boolean; selected?: string; onSelect: (path: string) => void; onChanged?: () => void; changes: FileTreeChange[]; openFile: (path: string) => void }) {
  const root = useRef<HTMLDivElement>(null), pending = useRef(new Map<string, AbortController>()), directoriesRef = useRef<Record<string, Entry[]>>({});
  const [directories, setDirectories] = useState<Record<string, Entry[]>>({}), [expanded, setExpanded] = useState(() => new Set<string>()), [selectedPaths, setSelectedPaths] = useState(() => new Set<string>());
  const [error, setError] = useState(''), [loading, setLoading] = useState(false), [term, setTerm] = useState(''), [showIgnored, setShowIgnored] = useState(true), [showHidden, setShowHidden] = useState(true), [changesOnly, setChangesOnly] = useState(false);
  const [sort, setSort] = useState<'name' | 'reverse' | 'type' | 'modified' | 'size'>('name'), [foldersFirst, setFoldersFirst] = useState(true), [clip, setClip] = useState<Clipboard | null>(clipboard);
  const [dialog, setDialog] = useState<FileOperationInput | null>(null), [context, setContext] = useState<{ path: string; x: number; y: number } | null>(null), [dropTarget, setDropTarget] = useState<string | null>(null);
  const [revision, setRevision] = useState(0), anchor = useRef<string>(''), expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const read = useCallback(async (path: string, force = false) => {
    if (pending.current.has(path) && !force) return;
    if (force) pending.current.get(path)?.abort();
    if (path && !directoryIsReachable(path, directoriesRef.current)) return;
    const controller = new AbortController(); pending.current.set(path, controller);
    if (!path) setLoading(true);
    try {
      const value = await importAPI('localDirectory', { repositoryId, taskId: task.id, path }, controller.signal);
      if (!controller.signal.aborted) {
        setDirectories(current => {
          if (path && !directoryIsReachable(path, current)) return current;
          const merged = { ...current, [path]: value.entries };
          if (path) return merged;
          return Object.fromEntries(Object.entries(merged).filter(([folder]) => !folder || directoryIsReachable(folder, merged)));
        }); setError('');
      }
    } catch (problem) { if (!controller.signal.aborted) setError(problem instanceof Error ? problem.message : '读取目录失败。'); }
    finally { if (pending.current.get(path) === controller) pending.current.delete(path); if (!path) setLoading(false); }
  }, [repositoryId, task.id]);
  useEffect(() => {
    directoriesRef.current = directories;
    setExpanded(current => {
      const next = new Set([...current].filter(path => directoryIsReachable(path, directories)));
      return next.size === current.size ? current : next;
    });
  }, [directories]);
  useEffect(() => {
    if (!enabled) return;
    void read('');
    const timer = setInterval(() => {
      if (document.hidden || root.current?.closest('[hidden]')) return;
      void read(''); for (const path of expandedRef.current) if (directoryIsReachable(path, directoriesRef.current)) void read(path);
    }, 5000);
    return () => { clearInterval(timer); for (const controller of pending.current.values()) controller.abort(); pending.current.clear(); };
  }, [read, enabled]);
  useEffect(() => { if (enabled) { void read('', true); for (const path of expandedRef.current) void read(path, true); } }, [revision, task.changeKey, enabled, read]);
  useEffect(() => {
    const changed = () => setClip(clipboard); window.addEventListener(clipboardEvent, changed);
    return () => window.removeEventListener(clipboardEvent, changed);
  }, []);
  const allEntries = useMemo(() => new Map(Object.values(directories).flat().map(entry => [entry.path, entry])), [directories]);
  const folders = useMemo(() => [...allEntries.values()].filter(entry => entry.directory).map(entry => entry.path).sort(compare.compare), [allEntries]);
  const changed = () => { setRevision(value => value + 1); setSelectedPaths(new Set()); onChanged?.(); };
  const knownPaths = useMemo(() => new Set([...task.tree, ...changes.map(file => file.path), ...allEntries.keys()]), [task.tree, changes, allEntries]);
  const changedPaths = useMemo(() => {
    const result = new Set<string>();
    for (const file of changes) { result.add(file.path); let folder = parent(file.path); while (folder) { result.add(folder); folder = parent(folder); } }
    return result;
  }, [changes]);
  const changeByPath = useMemo(() => {
    const result = new Map<string, FileTreeChange>();
    for (const file of changes) { result.set(file.path, file); let folder = parent(file.path); while (folder) { if (!result.has(folder)) result.set(folder, file); folder = parent(folder); } }
    return result;
  }, [changes]);
  const entryAt = (path: string): Entry | undefined => allEntries.get(path);
  const selectedDirectory = (path: string) => entryAt(path)?.directory ? path : parent(path);
  const operation = (mode: 'copy' | 'move' | 'delete', paths: string[], destination = '') => {
    if (window.gittogether?.backend === 'github-desktop') return;
    if (!enabled || !paths.length) return;
    setDialog({ repositoryId, taskId: task.id, operation: mode, paths, destination }); setContext(null);
  };
  const selection = (path: string) => selectedPaths.has(path) ? [...selectedPaths] : path ? [path] : [];
  const mark = (path: string, event: MouseEvent) => {
    const next = event.metaKey || event.ctrlKey ? new Set(selectedPaths) : new Set<string>();
    if (event.shiftKey && anchor.current) {
      const visible = [...root.current!.querySelectorAll<HTMLElement>('[data-tree-item]')].map(element => element.dataset.treeItem!);
      const first = visible.indexOf(anchor.current), last = visible.indexOf(path);
      if (first >= 0 && last >= 0) for (const item of visible.slice(Math.min(first, last), Math.max(first, last) + 1)) next.add(item);
    } else { if (next.has(path)) next.delete(path); else next.add(path); anchor.current = path; }
    setSelectedPaths(next);
  };
  const store = (mode: 'copy' | 'move', path: string) => {
    const paths = selection(path).filter(value => !entryAt(value)?.missing);
    if (!paths.length) return;
    clipboard = { repositoryId, taskId: task.id, paths, operation: mode }; window.dispatchEvent(new Event(clipboardEvent)); setContext(null);
  };
  const paste = (path: string) => {
    if (!clip || clip.repositoryId !== repositoryId) return;
    setDialog({ repositoryId, taskId: task.id, sourceTaskId: clip.taskId, operation: clip.operation, paths: clip.paths, destination: path }); setContext(null);
  };
  useEffect(() => {
    const handler = (event: Event) => {
      const value = (event as CustomEvent<FileOperationInput>).detail;
      if (enabled && value.repositoryId === repositoryId && value.taskId === task.id) setDialog(value);
    };
    window.addEventListener(dropEvent, handler); return () => window.removeEventListener(dropEvent, handler);
  }, [repositoryId, task.id, enabled]);
  useEffect(() => {
    if (!enabled || !isTauri()) return;
    let closed = false; const subscriptions: (() => void)[] = [];
    const target = (position: { x: number; y: number }) => {
      const element = document.elementFromPoint(position.x / window.devicePixelRatio, position.y / window.devicePixelRatio);
      const tree = element?.closest<HTMLElement>('[data-file-task]');
      if (!tree || tree !== root.current || tree.closest('[hidden]')) return null;
      return element?.closest<HTMLElement>('[data-drop-directory]')?.dataset.dropDirectory ?? '';
    };
    const add = (unsubscribe: () => void) => { if (closed) unsubscribe(); else subscriptions.push(unsubscribe); };
    void getCurrentWebview().onDragDropEvent(event => { setDropTarget(event.payload.type === 'enter' || event.payload.type === 'over' ? target(event.payload.position) : null); }).then(add).catch(problem => setError(`拖放监听失败：${String(problem)}`));
    void listen<{ dropId?: string; error?: string; position: { x: number; y: number } }>('gittogether-file-drop', event => {
      const destination = target(event.payload.position); if (destination === null) return;
      setDropTarget(null);
      if (event.payload.error) setError(event.payload.error);
      else if (event.payload.dropId) setDialog({ repositoryId, taskId: task.id, dropId: event.payload.dropId, destination, operation: 'copy' });
    }).then(add).catch(problem => setError(`拖入监听失败：${String(problem)}`));
    return () => { closed = true; subscriptions.forEach(unsubscribe => unsubscribe()); };
  }, [repositoryId, task.id, enabled]);
  const dragging = useRef<{ path: string; x: number; y: number; active: boolean } | null>(null);
  const startDrag = (event: PointerEvent, entry: Entry) => {
    if (!enabled || entry.missing || event.button !== 0 || (event.target as Element).closest('.repository-tree-open, .repository-tree-menu')) return;
    dragging.current = { path: entry.path, x: event.clientX, y: event.clientY, active: false };
  };
  useEffect(() => {
    const move = (event: globalThis.PointerEvent) => {
      const drag = dragging.current; if (!drag) return;
      if (!drag.active && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
      drag.active = true;
      const element = document.elementFromPoint(event.clientX, event.clientY), tree = element?.closest<HTMLElement>('[data-file-task]');
      setDropTarget(tree === root.current ? element?.closest<HTMLElement>('[data-drop-directory]')?.dataset.dropDirectory ?? '' : null);
    };
    const end = (event: globalThis.PointerEvent) => {
      const drag = dragging.current; dragging.current = null; setDropTarget(null); if (!drag?.active) return;
      const element = document.elementFromPoint(event.clientX, event.clientY), tree = element?.closest<HTMLElement>('[data-file-task]');
      if (tree && tree.dataset.fileRepository === repositoryId && !tree.closest('[hidden]')) {
        window.dispatchEvent(new CustomEvent(dropEvent, { detail: { repositoryId, taskId: tree.dataset.fileTask, sourceTaskId: task.id, paths: selectedPaths.has(drag.path) ? [...selectedPaths] : [drag.path], operation: event.altKey || event.ctrlKey ? 'copy' : 'move', destination: element?.closest<HTMLElement>('[data-drop-directory]')?.dataset.dropDirectory ?? '' } }));
      }
      const suppressClick = (event: globalThis.MouseEvent) => { event.preventDefault(); event.stopPropagation(); };
      document.addEventListener('click', suppressClick, { once: true, capture: true });
      window.setTimeout(() => document.removeEventListener('click', suppressClick, true), 0);
    };
    const cancel = () => { dragging.current = null; setDropTarget(null); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', cancel);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', cancel); };
  }, [repositoryId, task.id, selectedPaths]);
  const query = term.trim().toLowerCase();
  const queryPaths = useMemo(() => {
    if (!query) return { matches: [] as string[], ancestors: new Set<string>() };
    const matches = [...knownPaths].filter(path => path.toLowerCase().includes(query)), ancestors = new Set<string>();
    for (const match of matches) { let folder = parent(match); while (folder) { ancestors.add(folder); folder = parent(folder); } }
    return { matches, ancestors };
  }, [query, knownPaths]);
  const rows = (path: string): Entry[] => {
    const entries = new Map((directories[path] || []).map(entry => [entry.path, entry]));
    const extra = query ? queryPaths.matches : changes.filter(file => fileChangeKind(file.status) === 'deleted').map(file => file.path);
    for (const fullPath of extra) {
      if (path && !fullPath.startsWith(path + '/')) continue;
      if (query && !fullPath.toLowerCase().includes(query)) continue;
      const rest = path ? fullPath.slice(path.length + 1) : fullPath, name = rest.split('/')[0]; if (!name) continue;
      const itemPath = path ? `${path}/${name}` : name;
      if (!entries.has(itemPath)) entries.set(itemPath, allEntries.get(itemPath) || { name, path: itemPath, directory: rest.includes('/'), link: false, hidden: name.startsWith('.'), ignored: false, size: 0, modified: 0, missing: !query });
    }
    return [...entries.values()].filter(entry => (showIgnored || !entry.ignored) && (showHidden || !entry.hidden) && (!changesOnly || changedPaths.has(entry.path)) && (!query || entry.path.toLowerCase().includes(query) || queryPaths.ancestors.has(entry.path))).sort((left, right) => {
      if (foldersFirst && left.directory !== right.directory) return left.directory ? -1 : 1;
      return sort === 'reverse' ? compare.compare(right.name, left.name) : sort === 'modified' ? right.modified - left.modified || compare.compare(left.name, right.name) : sort === 'size' ? right.size - left.size || compare.compare(left.name, right.name) : sort === 'type' ? compare.compare(left.name.split('.').pop()!, right.name.split('.').pop()!) || compare.compare(left.name, right.name) : compare.compare(left.name, right.name);
    });
  };
  const render = (path: string) => rows(path).map(entry => {
    const change = changeByPath.get(entry.path), kind = change && fileChangeKind(change.status);
    const open = expanded.has(entry.path) || !!query;
    return <div key={entry.path} className="repository-tree-directory" role="treeitem" aria-expanded={entry.directory ? open : undefined} aria-selected={selectedPaths.has(entry.path) || selected === entry.path}>
      <div className={`repository-tree-row tree-file ${selectedPaths.has(entry.path) || selected === entry.path ? 'selected' : ''} ${dropTarget === entry.path && entry.directory ? 'is-drop-target' : ''} ${clip?.operation === 'move' && clip.taskId === task.id && clip.paths.includes(entry.path) ? 'is-cut' : ''}`} data-tree-item={entry.path} data-drop-directory={entry.directory ? entry.path : parent(entry.path)} data-change={kind} data-missing={entry.missing || undefined} data-ignored={entry.ignored || entry.hidden || undefined} onPointerDown={event => { if (window.gittogether?.backend !== 'github-desktop') startDrag(event, entry); }} onContextMenu={event => { if (window.gittogether?.backend === 'github-desktop') { event.preventDefault(); return; } event.preventDefault(); if (!selectedPaths.has(entry.path)) setSelectedPaths(new Set([entry.path])); setContext({ path: entry.path, x: event.clientX, y: event.clientY }); }}>
        <button type="button" className="repository-tree-select" title={`${entry.path}${entry.ignored ? ' · Git忽略' : entry.hidden ? ' · 隐藏文件' : ''}`} onClick={event => { mark(entry.path, event); if (entry.directory && !event.ctrlKey && !event.metaKey && !event.shiftKey) { setExpanded(current => { const next = new Set(current); if (next.has(entry.path)) next.delete(entry.path); else next.add(entry.path); return next; }); if (!entry.missing) void read(entry.path); } else if (!entry.directory) onSelect(entry.path); }} onDoubleClick={() => { if (!entry.directory && !entry.missing) openFile(entry.path); }}>
          <span className="tree-disclosure">{entry.directory && <Icon name={open ? 'down' : 'right'} size={11} />}</span><FileTypeIcon path={entry.path} directory={entry.directory} link={entry.link} /><span className="repository-tree-name">{entry.name}</span>{kind && <code aria-hidden="true">{letters[kind]}</code>}
        </button>
        {!entry.directory && <IconButton className="repository-tree-open" icon="external" label={`用默认应用打开 ${entry.path}`} disabled={entry.missing || !enabled} onClick={() => openFile(entry.path)} />}
        <IconButton className="repository-tree-menu repository-tree-open" icon="more" label={`${entry.name}：文件操作`} disabled={!enabled || entry.missing || entry.link} onClick={event => { setSelectedPaths(new Set([entry.path])); const rect = event.currentTarget.getBoundingClientRect(); setContext({ path: entry.path, x: rect.left, y: rect.bottom }); }} />
      </div>
      {entry.directory && open && <div className="repository-tree-children" role="group">{directories[entry.path] || query || entry.missing ? render(entry.path) : <p className="repository-data-note">正在读取…</p>}</div>}
    </div>;
  });
  const menuPath = context?.path || '', menuEntry = entryAt(menuPath), affected = selection(menuPath);
  return <div ref={root} className="local-file-tree" data-file-task={task.id} data-file-repository={repositoryId}>
    <div className="file-tree-toolbar"><SearchBar value={term} onChange={setTerm} placeholder="筛选文件…" /><Menu label="文件树筛选" trigger={<IconButton icon="sliders" label="文件树筛选" />}><MenuItem role="menuitemcheckbox" aria-checked={showIgnored} onClick={() => setShowIgnored(value => !value)}><Icon name={showIgnored ? 'check' : 'eyeSlash'} size={14} />显示 Git 忽略项</MenuItem><MenuItem role="menuitemcheckbox" aria-checked={showHidden} onClick={() => setShowHidden(value => !value)}><Icon name={showHidden ? 'check' : 'eyeSlash'} size={14} />显示隐藏文件</MenuItem><MenuItem role="menuitemcheckbox" aria-checked={changesOnly} onClick={() => setChangesOnly(value => !value)}><Icon name={changesOnly ? 'check' : 'file'} size={14} />仅显示更改</MenuItem></Menu><Menu label="文件树排序" trigger={<IconButton icon="list" label="文件树排序" />}>
      {([['name', '名称：A → Z'], ['reverse', '名称：Z → A'], ['type', '文件类型'], ['modified', '最近修改'], ['size', '文件大小']] as const).map(([value, label]) => <MenuItem key={value} role="menuitemradio" aria-checked={sort === value} onClick={() => setSort(value)}><Icon name={sort === value ? 'check' : 'file'} size={14} />{label}</MenuItem>)}<MenuItem role="menuitemcheckbox" aria-checked={foldersFirst} onClick={() => setFoldersFirst(value => !value)}><Icon name={foldersFirst ? 'check' : 'folder'} size={14} />文件夹优先</MenuItem></Menu><IconButton icon="refresh" label="刷新文件树" disabled={loading || !enabled} onClick={() => setRevision(value => value + 1)} /></div>
    <div className={`repository-task-tree ${dropTarget === '' ? 'is-drop-target' : ''}`} role="tree" aria-label={`${task.branch} 本地文件`} tabIndex={0} data-drop-directory="" onContextMenu={event => { if (event.target === event.currentTarget) { event.preventDefault(); setSelectedPaths(new Set()); setContext({ path: '', x: event.clientX, y: event.clientY }); } }} onKeyDown={event => {
      if (window.gittogether?.backend === 'github-desktop' && (['Delete', 'F2'].includes(event.key) || (event.metaKey || event.ctrlKey) && ['c', 'v', 'x', 'Backspace'].includes(event.key))) { event.preventDefault(); return; }
      if (event.target instanceof Element && event.target.closest('input, textarea, md-filled-text-field, md-outlined-text-field')) return;
      const paths = [...selectedPaths], path = paths[0] || selected || '';
      const buttons = [...root.current!.querySelectorAll<HTMLButtonElement>('.repository-tree-select')];
      const focusedPath = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-tree-item]')?.dataset.treeItem || path;
      const focusPath = (target: string) => buttons.find(button => button.closest<HTMLElement>('[data-tree-item]')?.dataset.treeItem === target)?.focus();
      if ((event.metaKey || event.ctrlKey) && ['c', 'x', 'v'].includes(event.key.toLowerCase())) { event.preventDefault(); if (event.key.toLowerCase() === 'v') paste(selectedDirectory(path)); else store(event.key.toLowerCase() === 'x' ? 'move' : 'copy', path); }
      else if (event.key === 'Delete' || event.metaKey && event.key === 'Backspace') { event.preventDefault(); operation('delete', selection(path)); }
      else if (event.key === 'F2' && path) { event.preventDefault(); setDialog({ repositoryId, taskId: task.id, paths: [path], operation: 'move', destination: parent(path), name: path.split('/').pop() }); }
      else if (event.key === 'Escape') { setSelectedPaths(new Set()); setContext(null); }
      else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const current = buttons.indexOf(document.activeElement as HTMLButtonElement); buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)))]?.focus(); }
      else if (event.key === 'ArrowRight' && focusedPath && entryAt(focusedPath)?.directory) { event.preventDefault(); if (!expanded.has(focusedPath)) { setExpanded(current => new Set(current).add(focusedPath)); void read(focusedPath); } else { const child = buttons.find(button => { const candidate = button.closest<HTMLElement>('[data-tree-item]')?.dataset.treeItem; return !!candidate && candidate !== focusedPath && parent(candidate) === focusedPath; }); child?.focus(); } }
      else if (event.key === 'ArrowLeft' && focusedPath) { event.preventDefault(); if (entryAt(focusedPath)?.directory && expanded.has(focusedPath)) setExpanded(current => { const next = new Set(current); next.delete(focusedPath); return next; }); else focusPath(parent(focusedPath)); }
    }}>
      {render('')}{!rows('').length && <p className="repository-tree-empty">{loading ? '正在读取本地目录…' : error ? '文件树暂不可用。' : '没有匹配的文件。'}</p>}
    </div>
    {error && <p className="repository-task-error" role="alert">{error}<Button variant="quiet" onClick={() => setRevision(value => value + 1)}>重试</Button></p>}
    {context && <div className="repository-graph-context" style={{ left: context.x, top: context.y }}><Menu label="文件操作" open placement="start" focusOnOpen="first" onOpenChange={open => { if (!open) setContext(null); }} trigger={<button className="graph-context-anchor" aria-label="文件操作" />}><MenuItem disabled={!affected.length} onClick={() => store('copy', menuPath)}>复制</MenuItem><MenuItem disabled={!affected.length} onClick={() => store('move', menuPath)}>剪切</MenuItem><MenuItem disabled={!clip || clip.repositoryId !== repositoryId} onClick={() => paste(menuEntry?.directory ? menuPath : parent(menuPath))}>粘贴到{menuEntry?.directory ? ` ${menuEntry.name}` : '当前文件夹'}</MenuItem><MenuItem disabled={!affected.length} onClick={() => operation('copy', affected, parent(menuPath))}>复制到…</MenuItem><MenuItem disabled={!affected.length} onClick={() => operation('move', affected, parent(menuPath))}>移动到…</MenuItem><MenuItem disabled={affected.length !== 1} onClick={() => { setContext(null); setDialog({ repositoryId, taskId: task.id, operation: 'move', paths: affected, destination: parent(menuPath), name: menuPath.split('/').pop() }); }}>重命名</MenuItem><MenuItem destructive disabled={!affected.length} onClick={() => operation('delete', affected)}>移入回收站</MenuItem></Menu></div>}
    {dialog && <FileOperationDialog input={dialog} folders={folders} onClose={() => setDialog(null)} onChanged={changed} />}
  </div>;
}
