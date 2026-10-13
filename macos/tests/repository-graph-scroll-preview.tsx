// Uses production graph rendering with synthetic history, without accounts or Git writes.
import { Profiler, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RepositoryGraph } from '../src/RepositoryGraph';
import { Button, MaterialProvider, Notice } from '../src/ui';
import type { RepositoryWorkspace } from '../src/repository-model';
import 'open-glass-ui/styles.css';
import '../src/styles.css';

const hash = (index: number) => index.toString(16).padStart(40, '0');
const workspace: RepositoryWorkspace = {
  source: 'mixed', complete: true,
  commits: Array.from({ length: 5000 }, (_, index) => ({
    id: hash(index), parents: index === 4999 ? [] : [hash(index + 1), ...(index % 120 === 30 && index + 50 < 5000 ? [hash(index + 50)] : [])],
    summary: `Commit ${index} · ${index === 4800 ? 'needle-search-target' : '历史与合并图线检查'}`, author: 'Preview Author', time: '2026-10-13T00:00:00Z',
    refs: index === 0 ? ['main'] : index === 3 ? ['origin/main'] : index % 32 === 0 ? [`origin/feature/${index / 32}`] : [],
  })),
  tasks: [
    { id: 'local-main', branch: 'main', head: hash(0), path: '/preview/main', files: [{ path: 'preview.txt', status: 'M', tracked: true }], tree: ['preview.txt'], error: '' },
    { id: 'remote-main', branch: 'main', head: hash(3), path: null, remote: true, files: [], tree: [], error: '' },
    ...Array.from({ length: 156 }, (_, index) => ({ id: `remote-${index}`, branch: `feature/${index + 1}`, head: hash((index + 1) * 32), path: null, remote: true, files: [], tree: [], error: '' })),
  ],
};
const emptyMetrics = () => ({ frames: [] as number[], longTasks: [] as number[], renders: [] as number[] });

function Preview() {
  const [source, setSource] = useState(workspace);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [report, setReport] = useState('');
  const metrics = useRef(emptyMetrics());
  useEffect(() => { document.documentElement.dataset.theme = 'dark'; }, []);
  useEffect(() => {
    if (!measuring) return;
    const observer = new PerformanceObserver(list => metrics.current.longTasks.push(...list.getEntries().map(entry => entry.duration)));
    observer.observe({ type: 'longtask', buffered: false });
    let previous = performance.now(), frame = 0;
    const sample = (now: number) => { metrics.current.frames.push(now - previous); previous = now; frame = requestAnimationFrame(sample); };
    frame = requestAnimationFrame(sample);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [measuring]);
  return <MaterialProvider appearance="dark"><main style={{ padding: 16, height: '100vh', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 10 }}>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <Button onClick={() => { metrics.current = emptyMetrics(); setMeasuring(true); }}>开始统计</Button>
      <Button onClick={() => { setMeasuring(false); setReport(JSON.stringify(metrics.current)); }}>结束统计</Button>
      <Button onClick={() => { setLoading(true); setError(''); }}>开始隔离读取</Button>
      <Button onClick={() => setLoading(false)}>完成隔离读取</Button>
      <Button onClick={() => { setLoading(false); setError('隔离读取失败；保留已有历史。'); }}>失败隔离读取</Button>
      <Button onClick={() => setSource(current => ({ ...current, commits: current.commits.map(commit => ({ ...commit })) }))}>刷新历史</Button>
      <Button onClick={() => setSearch(value => value ? '' : 'needle-search-target')}>切换搜索</Button>
    </div>
    {error && <Notice kind="error">{error}</Notice>}
    <section id="repository-graph-column" className="repository-column repository-graph-column flat-group" aria-label="分支图" style={{ width: 700, maxWidth: '100%', flex: 1 }}>
      <Profiler id="graph" onRender={(_id, _phase, duration) => metrics.current.renders.push(duration)}>
        <RepositoryGraph workspace={source} search={search} focusedTask={null} loading={loading} onSelectCommit={setSelected} />
      </Profiler>
    </section>
    <output aria-label="已选提交" hidden>{selected}</output>
    <output aria-label="性能测量" hidden>{report}</output>
  </main></MaterialProvider>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
