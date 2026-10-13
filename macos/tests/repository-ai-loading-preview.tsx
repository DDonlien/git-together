// Exercise the production component with controlled promises, without AI or Git calls.
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RepositoryCommitComposer } from '../src/RepositoryCommitComposer';
import { MaterialProvider, Button } from '../src/ui';
import type { CommitDraft, GenerateCommitMessage } from '../src/local-submit-model';
import type { RepositoryTask } from '../src/repository-model';
import 'open-glass-ui/styles.css';
import '../src/styles.css';

const task: RepositoryTask = {
  id: 'preview-task', branch: 'main', head: 'a'.repeat(40), changeKey: 'b'.repeat(64),
  path: 'D:\\preview\\repository', files: [{ path: 'src/example.ts', status: 'M', tracked: true }],
  tree: ['src/example.ts'], error: '',
};
type Request = { signal: AbortSignal; resolve: (draft: CommitDraft) => void; reject: (error: Error) => void; settled: boolean };

function Preview() {
  const [dark, setDark] = useState(true), [started, setStarted] = useState(0), [cancelled, setCancelled] = useState(0);
  const requests = useRef<Request[]>([]);
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; }, [dark]);
  const generate: GenerateCommitMessage = (_input, signal) => new Promise((resolve, reject) => {
    requests.current.push({ signal, resolve, reject, settled: false });
    setStarted(value => value + 1);
    // Leave cancelled promises pending so late responses exercise the production guard.
    signal.addEventListener('abort', () => setCancelled(value => value + 1), { once: true });
  });
  return <MaterialProvider appearance={dark ? 'dark' : 'light'}>
    <main style={{ width: 'min(560px, calc(100vw - 32px))', margin: '32px auto' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <Button onClick={() => setDark(value => !value)}>切换主题</Button>
        <Button onClick={() => {
          const request = requests.current.find(item => !item.settled && !item.signal.aborted);
          if (request) { request.settled = true; request.resolve({ summary: 'AI 生成摘要', description: '' }); }
        }}>模拟成功</Button>
        <Button onClick={() => {
          const request = requests.current.find(item => !item.settled && !item.signal.aborted);
          if (request) { request.settled = true; request.reject(new Error('模拟 AI 服务失败')); }
        }}>模拟失败</Button>
        <Button onClick={() => {
          const request = requests.current.find(item => !item.settled && item.signal.aborted);
          if (request) { request.settled = true; request.resolve({ summary: '已取消请求的迟到摘要', description: '' }); }
        }}>返回取消后的结果</Button>
      </div>
      <section className="repository-column flat-group" style={{ height: 390, minWidth: 0 }}>
        <div className="repository-column-heading"><h2>更改与 Diff</h2></div>
        <div style={{ padding: 12 }}><strong>main</strong><p>{task.path}</p><p style={{ marginTop: 16 }}>src/example.ts　M</p></div>
        <RepositoryCommitComposer repositoryId="preview-repository" repositoryName="preview" task={task} onGenerate={generate}
          onSubmit={async () => { throw new Error('隔离预览不执行提交'); }} onPush={async () => { throw new Error('隔离预览不执行推送'); }} />
      </section>
      <output aria-label="生成请求次数">{started}</output> / <output aria-label="取消请求次数">{cancelled}</output>
    </main>
  </MaterialProvider>;
}
const root = createRoot(document.getElementById('root')!);
root.render(<Preview />);
import.meta.hot?.dispose(() => root.unmount());
