import type { ReactNode } from 'react';
import { fileChangeKind, type FileTreeChange } from './file-tree';
import { RepositoryFileChangeLabel } from './RepositoryFileChangeLabel';

type ChangedFile = FileTreeChange & { tracked?: boolean };

const groups = [
  { kind: 'added', label: '新增' },
  { kind: 'modified', label: '修改' },
  { kind: 'deleted', label: '删除' },
  { kind: 'other', label: '其他' },
] as const;

export function RepositoryChangedFiles({ files, selected, onSelect, search, grouped = false, label, empty }: {
  files: ChangedFile[]; selected?: string; onSelect: (path?: string) => void; search: string;
  grouped?: boolean; label: string; empty?: ReactNode;
}) {
  const visible = files.filter(file => file.path.toLowerCase().includes(search.toLowerCase()));
  const sections = grouped ? groups.map(group => ({ key: group.kind, label: group.label, files: visible.filter(file => (fileChangeKind(file.status) || 'other') === group.kind) })) : [
    { key: 'tracked', label: 'Tracked', files: visible.filter(file => file.tracked !== false) },
    { key: 'untracked', label: 'Untracked', files: visible.filter(file => file.tracked === false) },
  ];
  const row = (file: ChangedFile) => <div key={file.path} className="submit-file-row is-included" data-change={fileChangeKind(file.status) || 'other'}>
    <button type="button" className={`submit-file-choice${selected === file.path ? ' selected' : ''}`} onClick={() => onSelect(file.path)} aria-pressed={selected === file.path} aria-label={`查看文件更改：${file.previousPath ? `${file.previousPath} → ${file.path}` : file.path}（${file.status}）`}><RepositoryFileChangeLabel file={file} /></button>
  </div>;
  return <div className="repository-changed-files" aria-label={label}>
    {visible.length ? sections.map(group => group.files.length ? <section key={group.key} className="submit-file-group" aria-label={group.label}><h3 className="submit-file-group-heading"><span>{group.label}<small>{group.files.length}</small></span></h3>{group.files.map(row)}</section> : null) : files.length ? <p className="repository-data-note">没有符合搜索条件的文件。</p> : empty || <p className="repository-data-note">此提交没有文件差异。</p>}
  </div>;
}
