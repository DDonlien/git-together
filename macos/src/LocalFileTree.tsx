import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Icon, IconButton, Menu, MenuItem, Notice } from './ui';
import { SearchBar } from './material-inputs';
import { importAPI } from './import-api';
import { FileTypeIcon } from './FileTypeIcon';
import { fileChangeKind, type FileTreeChange } from './file-tree';
import type { FileEntry } from './file-operation-model';
import type { RepositoryTask } from './repository-model';
const compare = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const letters = { added: 'A', modified: 'M', deleted: 'D' };
export function LocalFileTree({ task, repositoryId, enabled, selected, onSelect, changes, openFile }: { task: RepositoryTask; repositoryId: string; enabled: boolean; selected?: string; onSelect: (path: string) => void; onChanged?: () => void; changes: FileTreeChange[]; openFile: (path: string) => void }) {
  const [directories, setDirectories] = useState<Record<string, FileEntry[]>>({}), [expanded, setExpanded] = useState(() => new Set<string>());
  const [error, setError] = useState(''), [loading, setLoading] = useState(false), [term, setTerm] = useState(''), [showIgnored, setShowIgnored] = useState(true), [showHidden, setShowHidden] = useState(true), [reverse, setReverse] = useState(false);
  const pending = useRef(new Map<string, AbortController>());
  const read = useCallback(async (path: string) => {
    if (!enabled || pending.current.has(path)) return;
    const cancellation = new AbortController(); pending.current.set(path, cancellation); setLoading(true);
    try { const result = await importAPI('localDirectory', { repositoryId, taskId: task.id, path }, cancellation.signal); if (!cancellation.signal.aborted) { setDirectories(previous => ({ ...previous, [path]: result.entries })); setError(''); } }
    catch (problem) { if (!cancellation.signal.aborted) setError(problem instanceof Error ? problem.message : '本地目录读取失败。'); }
    finally { if (pending.current.get(path) === cancellation) pending.current.delete(path); if (!cancellation.signal.aborted) setLoading(pending.current.size > 0); }
  }, [enabled, repositoryId, task.id]);
  useEffect(() => { setDirectories({}); setExpanded(new Set()); void read(''); return () => { for (const cancel of pending.current.values()) cancel.abort(); pending.current.clear(); }; }, [read]);
  const changeByPath = new Map(changes.map(file => [file.path, file]));
  const render = (path: string): React.ReactNode => (directories[path] || []).filter(entry => (showIgnored || !entry.ignored) && (showHidden || !entry.hidden) && (!term || entry.directory || entry.path.toLowerCase().includes(term.toLowerCase()))).sort((a, b) => Number(b.directory) - Number(a.directory) || (reverse ? -1 : 1) * compare.compare(a.name, b.name)).map(entry => {
    const open = expanded.has(entry.path), change = changeByPath.get(entry.path), kind = change && fileChangeKind(change.status);
    return <div key={entry.path} className="repository-tree-directory" role="treeitem" aria-expanded={entry.directory ? open : undefined} aria-selected={selected === entry.path}><div className={`repository-tree-row tree-file ${selected === entry.path ? 'selected' : ''}`} data-change={kind} data-ignored={entry.ignored || entry.hidden || undefined}><button className="repository-tree-select" title={entry.path} onClick={() => { if (entry.directory) { setExpanded(previous => { const next = new Set(previous); if (next.has(entry.path)) next.delete(entry.path); else next.add(entry.path); return next; }); if (!directories[entry.path]) void read(entry.path); } else onSelect(entry.path); }} onDoubleClick={() => { if (!entry.directory) openFile(entry.path); }}><span className="tree-disclosure">{entry.directory && <Icon name={open ? 'down' : 'right'} size={11} />}</span><FileTypeIcon path={entry.path} directory={entry.directory} link={entry.link} /><span className="repository-tree-name">{entry.name}</span>{kind && <code>{letters[kind]}</code>}</button>{!entry.directory && <IconButton className="repository-tree-open" icon="external" label={`用默认应用打开 ${entry.path}`} disabled={!enabled} onClick={() => openFile(entry.path)} />}</div>{entry.directory && open && <div className="repository-tree-children" role="group">{directories[entry.path] ? render(entry.path) : <p className="repository-data-note">正在读取…</p>}</div>}</div>;
  });
  return <div className="local-file-tree"><div className="file-tree-toolbar"><SearchBar value={term} onChange={setTerm} placeholder="筛选文件…" /><Menu label="文件树筛选" trigger={<IconButton icon="sliders" label="文件树筛选" />}><MenuItem role="menuitemcheckbox" aria-checked={showIgnored} onClick={() => setShowIgnored(value => !value)}>显示 Git 忽略项</MenuItem><MenuItem role="menuitemcheckbox" aria-checked={showHidden} onClick={() => setShowHidden(value => !value)}>显示隐藏文件</MenuItem><MenuItem role="menuitemcheckbox" aria-checked={reverse} onClick={() => setReverse(value => !value)}>名称倒序</MenuItem></Menu><IconButton icon="refresh" label="刷新文件树" disabled={loading || !enabled} onClick={() => { setDirectories({}); setExpanded(new Set()); void read(''); }} /></div><div className="repository-task-tree" role="tree" aria-label={`${task.branch} 本地文件`}>{render('')}{!directories['']?.length && <p className="repository-tree-empty">{loading ? '正在读取本地目录…' : '没有文件。'}</p>}</div>{error && <Notice kind="error">{error}<Button variant="quiet" onClick={() => void read('')}>重试</Button></Notice>}</div>;
}
