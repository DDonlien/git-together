import { useState } from 'react';
import type { LocalFile } from './import-model';
import { RepositoryFileChangeLabel } from './RepositoryFileChangeLabel';
import { Icon } from './ui';

function PreparedDiffFile({ file, patch, first }: { file: LocalFile; patch: string; first: boolean }) {
  const [open, setOpen] = useState(first);
  return <section className="prepared-diff-file">
    <button type="button" className={`submit-file-choice change-${file.status[0] === 'A' ? 'added' : file.status[0] === 'D' ? 'deleted' : 'modified'}`} aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <Icon name={open ? 'down' : 'right'} size={12} /><RepositoryFileChangeLabel file={file} />
    </button>
    {open && <pre className="prepared-diff-patch" tabIndex={0} aria-label={`${file.path} 的差异`}><code>{patch || '文件内容未显示文本差异（例如空文件或二进制文件）。'}</code></pre>}
  </section>;
}
export function RepositoryPreparedDiff({ files, patch }: { files: LocalFile[]; patch: string }) {
  const patches = patch.split(/(?=^diff --git )/m).filter(Boolean);
  return <div className="prepared-diff" aria-label="准备的文件差异">{files.length ? files.map((file, index) => <PreparedDiffFile key={file.path} file={file} patch={patches[index] || ''} first={index === 0} />) : <p className="muted">没有文件内容差异。</p>}</div>;
}
