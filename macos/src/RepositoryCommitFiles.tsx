import type { LocalFile } from './import-model';
import { Checkbox } from './ui';
import { fileChangeKind } from './file-tree';

export function RepositoryCommitFiles({ files, paths, branch, disabled, onChange }: {
  files: LocalFile[]; paths: string[]; branch: string; disabled: boolean; onChange: (paths: string[]) => void;
}) {
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
      return <section className="submit-file-group" key={String(tracked)} aria-label={tracked ? 'Tracked' : 'Untracked'}>
        <div className="submit-file-group-heading"><span>{tracked ? 'Tracked' : 'Untracked'} <small>{group.length}</small></span><Checkbox checked={count === group.length} mixed={count > 0 && count < group.length} disabled={disabled} label={`选择${tracked ? 'Tracked' : 'Untracked'}：${branch}`} onChange={() => toggle(group)} /></div>
        {group.map(file => {
          const kind = fileChangeKind(file.status) || 'modified', name = kind === 'added' ? '新增' : kind === 'deleted' ? '删除' : '修改';
          return <div className={`submit-file-row${selected.has(file.path) ? ' is-included' : ''}`} key={file.path} data-change={kind}>
            <button type="button" className="submit-file-choice" disabled={disabled} aria-pressed={selected.has(file.path)} aria-label={`${selected.has(file.path) ? '移出' : '加入'}提交范围：${name} ${file.path}`} onClick={() => toggle([file])}>
              <span className="submit-file-mark" aria-label={name}>{kind === 'added' ? '+' : kind === 'deleted' ? '−' : '•'}</span><span className="submit-file-path" title={file.previousPath ? `${file.previousPath} → ${file.path}` : file.path}>{file.path}</span><code aria-hidden="true">{kind === 'added' ? 'A' : kind === 'deleted' ? 'D' : file.status.includes('R') ? 'R' : 'M'}</code>
            </button><Checkbox checked={selected.has(file.path)} disabled={disabled} label={`包含文件：${branch} / ${file.path}`} onChange={() => toggle([file])} />
          </div>;
        })}
      </section>;
    })}
  </div>;
}
