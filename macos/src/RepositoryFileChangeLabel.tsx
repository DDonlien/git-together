import { fileChangeKind, type FileTreeChange } from './file-tree';

export function RepositoryFileChangeLabel({ file }: { file: FileTreeChange }) {
  const kind = fileChangeKind(file.status);
  const name = kind === 'added' ? '新增' : kind === 'deleted' ? '删除' : kind === 'modified' ? '修改' : '其他更改';
  const path = file.previousPath ? `${file.previousPath} → ${file.path}` : file.path;
  return <>
    <span className="submit-file-mark" aria-label={name} title={`${name} · ${file.status}`}>{kind === 'added' ? '+' : kind === 'deleted' ? '−' : kind === 'modified' ? '•' : '?'}</span>
    <span className="submit-file-path" title={`${path} · ${file.status}`}>{file.path}</span>
  </>;
}
