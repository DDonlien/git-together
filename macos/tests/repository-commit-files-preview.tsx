// Isolated interaction entry; no Git, account service, or real submission.
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RepositoryCommitFiles } from '../src/RepositoryCommitFiles';
import { MaterialProvider, Button } from '../src/ui';
import type { LocalFile } from '../src/import-model';
import 'open-glass-ui/styles.css';
import '../src/styles.css';

const initial: LocalFile[] = [
  ...Array.from({ length: 23 }, (_, index) => ({ path: `src/feature-${index}.ts`, status: index === 22 ? 'D' : 'M', tracked: true })),
  { path: 'new.txt', status: '??', tracked: false },
  { path: 'assets/long-folder-name/another-folder/new-file-with-a-long-name.txt', status: '??', tracked: false },
];

function Preview() {
  const [files, setFiles] = useState(initial);
  const [paths, setPaths] = useState(initial.map(file => file.path));
  const [peerPaths, setPeerPaths] = useState(initial.map(file => file.path));
  const [changes, setChanges] = useState(0);
  const [disabled, setDisabled] = useState(false);
  const [dark, setDark] = useState(true);
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; }, [dark]);
  return <MaterialProvider appearance={dark ? 'dark' : 'light'}>
    <main style={{ width: 'min(500px, calc(100vw - 32px))', margin: '16px auto', padding: 16, background: 'var(--surface)', boxSizing: 'border-box' }}>
      <h1 style={{ fontSize: 14 }}>提交分组交互检查</h1>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Button onClick={() => setFiles(current => current.map(file => ({ ...file })))}>刷新文件数据</Button>
        <Button onClick={() => setDisabled(value => !value)}>切换选择锁定</Button>
        <Button onClick={() => setDark(value => !value)}>切换主题</Button>
      </div>
      <section aria-label="预览清单 A">
        <RepositoryCommitFiles files={files} paths={paths} branch="main" disabled={disabled} onChange={next => { setPaths(next); setChanges(value => value + 1); }} />
        <output aria-label="选择变更次数" hidden>{changes}</output>
        <output aria-label="选中的文件" hidden>{paths.join(',')}</output>
      </section>
      <section aria-label="预览清单 B">
        <h2 style={{ fontSize: 14 }}>另一个工作目录</h2>
        <RepositoryCommitFiles files={files} paths={peerPaths} branch="main" disabled={disabled} onChange={setPeerPaths} />
      </section>
    </main>
  </MaterialProvider>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
