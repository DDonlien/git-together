import { useId, useState } from 'react';
import type { LocalFile } from './import-model';
import { Checkbox, Icon } from './ui';
import { fileChangeKind } from './file-tree';
import { RepositoryFileChangeLabel } from './RepositoryFileChangeLabel';

export function RepositoryCommitFiles({ files, paths, branch, disabled, onChange }: {
  files: LocalFile[]; paths: string[]; branch: string; disabled: boolean; onChange: (paths: string[]) => void;
}) {
  const id = useId();
  const [collapsed, setCollapsed] = useState({ Tracked: false, Untracked: false });
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
          return <div className={`submit-file-row${selected.has(file.path) ? ' is-included' : ''}`} key={file.path} data-change={kind}>
            <button type="button" className="submit-file-choice" disabled={disabled} aria-pressed={selected.has(file.path)} aria-label={`${selected.has(file.path) ? '移出' : '加入'}提交范围：${name} ${file.previousPath ? `${file.previousPath} → ${file.path}` : file.path}（${file.status}）`} onClick={() => toggle([file])}>
              <RepositoryFileChangeLabel file={file} />
            </button><Checkbox checked={selected.has(file.path)} disabled={disabled} label={`包含文件：${branch} / ${file.path}`} onChange={() => toggle([file])} />
          </div>;
        })}
        </div>
      </section>;
    })}
  </div>;
}
