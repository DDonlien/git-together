import { useId, useState } from 'react';
import type { LocalFile } from './import-model';
import { Checkbox, Icon, Menu, MenuItem } from './ui';
import { fileChangeKind } from './file-tree';
import { RepositoryFileChangeLabel } from './RepositoryFileChangeLabel';

export function RepositoryCommitFiles({ files, paths, branch, disabled, onChange, onIgnore }: {
  files: LocalFile[]; paths: string[]; branch: string; disabled: boolean; onChange: (paths: string[]) => void; onIgnore?: (file: LocalFile) => void;
}) {
  const id = useId();
  const [collapsed, setCollapsed] = useState({ Tracked: false, Untracked: false });
  const [context, setContext] = useState<{ path: string; x: number; y: number } | null>(null);
  const contextFile = !disabled && files.find(file => file.path === context?.path);
  const selected = new Set(paths);
  const toggle = (scope: LocalFile[]) => {
    const remove = scope.every(file => selected.has(file.path)), next = new Set(paths);
    for (const file of scope) { if (remove) next.delete(file.path); else next.add(file.path); }
    onChange(files.filter(file => next.has(file.path)).map(file => file.path));
  };
  return <div className="repository-commit-files" aria-label={`提交清单：${branch}`}>
    <div className="submit-file-selection"><small>已选 {paths.length} / {files.length}</small><Checkbox checked={paths.length === files.length} mixed={paths.length > 0 && paths.length < files.length} disabled={disabled} label={`选择全部更改：${branch}`} onChange={() => toggle(files)} /></div>
    {[true, false].map(tracked => {
      const group = files.filter(file => file.tracked === tracked), count = group.filter(file => selected.has(file.path)).length;
      if (!group.length) return null;
      const name = tracked ? 'Tracked' : 'Untracked';
      return <section className="submit-file-group" key={name} aria-label={name}>
        <div className="submit-file-group-heading"><button type="button" className="submit-file-group-toggle" aria-label={`${collapsed[name] ? '展开' : '收起'} ${name}：${branch}`} aria-expanded={!collapsed[name]} aria-controls={`${id}-${name}`} onClick={() => setCollapsed(current => ({ ...current, [name]: !current[name] }))}><Icon name={collapsed[name] ? 'right' : 'down'} size={14} /><span>{name} <small>{group.length}</small></span></button><Checkbox checked={count === group.length} mixed={count > 0 && count < group.length} disabled={disabled} label={`选择${name}：${branch}`} onChange={() => toggle(group)} /></div>
        <div id={`${id}-${name}`} hidden={collapsed[name]}>
        {group.map(file => {
          const kind = fileChangeKind(file.status) || 'other', name = kind === 'added' ? '新增' : kind === 'deleted' ? '删除' : kind === 'modified' ? '修改' : '其他更改';
          return <div className={`submit-file-row${selected.has(file.path) ? ' is-included' : ''}`} key={file.path} data-change={kind} onContextMenu={onIgnore ? event => { event.preventDefault(); if (!disabled) setContext({ path: file.path, x: event.clientX, y: event.clientY }); } : undefined}>
            <button type="button" className="submit-file-choice" disabled={disabled} aria-haspopup={onIgnore ? 'menu' : undefined} aria-pressed={selected.has(file.path)} aria-label={`${selected.has(file.path) ? '移出' : '加入'}提交范围：${name} ${file.previousPath ? `${file.previousPath} → ${file.path}` : file.path}（${file.status}）`} onClick={() => toggle([file])} onKeyDown={onIgnore ? event => { if (event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10') { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); setContext({ path: file.path, x: rect.left, y: rect.bottom }); } } : undefined}>
              <RepositoryFileChangeLabel file={file} />
            </button><Checkbox checked={selected.has(file.path)} disabled={disabled} label={`包含文件：${branch} / ${file.path}`} onChange={() => toggle([file])} />
          </div>;
        })}
        </div>
      </section>;
    })}
    {context && contextFile && onIgnore && <div className="repository-graph-context" style={{ left: context.x, top: context.y }}><Menu label={`文件操作：${contextFile.path}`} open placement="start" focusOnOpen="first" onOpenChange={open => { if (!open) setContext(null); }} trigger={<button type="button" className="graph-context-anchor" aria-label="文件操作" />}><MenuItem disabled={contextFile.path === '.gitignore' || ['D', 'U'].includes(contextFile.status)} onClick={() => { const file = contextFile; setContext(null); onIgnore(file); }}>{contextFile.tracked ? 'Ignore（停止跟踪，保留本地文件）' : 'Ignore（忽略此文件）'}</MenuItem></Menu></div>}
  </div>;
}
