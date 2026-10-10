import type { ReactNode } from 'react';
import { Icon } from './ui';
import { fileChangeKind, type FileTreeChange } from './file-tree';

const groups = [
  { kind: 'added', label: '新增' },
  { kind: 'modified', label: '修改' },
  { kind: 'deleted', label: '删除' },
  { kind: 'other', label: '其他' },
] as const;

export function RepositoryChangedFiles({ files, selected, onSelect, search, grouped = false, label, empty }: {
  files: FileTreeChange[]; selected?: string; onSelect: (path?: string) => void; search: string;
  grouped?: boolean; label: string; empty?: ReactNode;
}) {
  const visible = files.filter(file => file.path.toLowerCase().includes(search.toLowerCase()));
  const row = (file: FileTreeChange) => <button key={file.path} className={`readonly-file ${selected === file.path ? 'selected' : ''}`} onClick={() => onSelect(file.path)} aria-pressed={selected === file.path}><Icon name="file" size={15} /><span title={file.path}>{file.path}</span><code>{file.status}</code></button>;
  return <div className="repository-changed-files" aria-label={label}>
    {visible.length ? grouped ? groups.map(group => {
      const entries = visible.filter(file => (fileChangeKind(file.status) || 'other') === group.kind);
      return entries.length ? <section key={group.kind} className="repository-change-group" aria-label={group.label}><h3 data-change={group.kind}>{group.label}<small>{entries.length}</small></h3>{entries.map(row)}</section> : null;
    }) : visible.map(row) : files.length ? <p className="repository-data-note">没有符合搜索条件的文件。</p> : empty || <p className="repository-data-note">此提交没有文件差异。</p>}
  </div>;
}
