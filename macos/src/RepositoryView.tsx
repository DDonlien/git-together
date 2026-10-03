import { useEffect, useState } from 'react';
import { importAPI } from './import-api';
import type { LocalSnapshot, RemoteRepository } from './import-model';
import { Button, Icon, IconButton, Notice, Segmented } from './ui';

export function RepositoryView({ repository, globalSearch, onConfigure }: { repository: RemoteRepository; globalSearch: string; onConfigure: () => void }) {
  const [snapshot, setSnapshot] = useState<LocalSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [tab, setTab] = useState<'files' | 'history'>('files');
  const [file, setFile] = useState<string | null>(null);
  const [diff, setDiff] = useState('');
  const [diffError, setDiffError] = useState('');
  const [diffLoading, setDiffLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(''); setFile(null);
    void importAPI('snapshot', { repositoryId: repository.id }).then(value => { if (!cancelled) setSnapshot(value); }).catch(problem => { if (!cancelled) setError(problem instanceof Error ? problem.message : '读取失败。'); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [repository.id, revision]);
  useEffect(() => {
    let cancelled = false; setDiff(''); setDiffError('');
    if (!file) { setDiffLoading(false); return; }
    setDiffLoading(true);
    void importAPI('diff', { repositoryId: repository.id, path: file }).then(value => { if (!cancelled) setDiff(value.text); }).catch(problem => { if (!cancelled) setDiffError(problem instanceof Error ? problem.message : '读取 Diff 失败。'); }).finally(() => { if (!cancelled) setDiffLoading(false); });
    return () => { cancelled = true; };
  }, [repository.id, file]);
  const files = snapshot?.files.filter(f => f.path.toLowerCase().includes(globalSearch.toLowerCase())) || [];
  return <main className="repository-readonly-view"><div className="repository-readonly-heading"><div><h1>{repository.name}</h1><p>{snapshot?.path || repository.fullName}</p></div><Button onClick={onConfigure}>配置本地</Button><Button disabled={loading} leadingIcon={<Icon name={loading ? 'spinner' : 'refresh'} className={loading ? 'spin' : ''} size={15} />} onClick={() => setRevision(n => n + 1)}>刷新</Button></div><Notice kind="info">当前为真实仓库只读视图。不会暂存、提交、拉取或推送文件。</Notice>{error && <Notice kind="error">{error}</Notice>}
    <div className="readonly-tabs"><Segmented<'files' | 'history'> aria-label="仓库视图" value={tab} onValueChange={setTab} items={[{ value: 'files', label: '文件更改' }, { value: 'history', label: '提交历史' }]} /><span className="branch-label"><Icon name="branch" size={14} />{snapshot?.branch || '—'}</span></div>
    {loading ? <div className="import-empty flat-group" role="status"><Icon name="spinner" className="spin" size={25} /><p>正在读取本地 Git 仓库…</p></div> : !error && snapshot && (tab === 'history' ? <section className="readonly-history flat-group"><h2>最近提交</h2>{snapshot.commits.filter(c => `${c.summary} ${c.author}`.toLowerCase().includes(globalSearch.toLowerCase())).map(commit => <div key={commit.id} className="readonly-commit"><Icon name="commit" size={17} /><div><strong>{commit.summary}</strong><small>{commit.author} · {new Date(commit.time).toLocaleString()}</small></div><code title={commit.id}>{commit.id.slice(0, 8)}</code></div>)}{!snapshot.commits.length && <p className="muted">这个仓库还没有提交。</p>}</section> : <div className={`readonly-files-layout ${file ? 'with-diff' : ''}`}><section className="readonly-file-list flat-group"><div className="section-title"><h2>文件更改</h2><span className="muted">{snapshot.files.length} 个文件</span></div>{files.map(changed => <button key={changed.path} className={`readonly-file ${file === changed.path ? 'selected' : ''}`} onClick={() => setFile(changed.path)}><Icon name="file" size={16} /><span>{changed.path}</span><code>{changed.status}</code></button>)}{!files.length && <div className="account-repos-empty">{snapshot.files.length ? '没有符合搜索条件的文件。' : '工作目录干净，没有未提交的更改。'}</div>}</section>{file && <section className="readonly-diff flat-group"><div className="section-title"><strong>{file}</strong><IconButton icon="close" label="关闭 Diff" onClick={() => setFile(null)} /></div>{diffLoading ? <p role="status">正在读取 Diff…</p> : diffError ? <Notice kind="error">{diffError}</Notice> : <pre aria-label="文件 Diff">{diff.split('\n').map((line, index) => <span key={index} className={line.startsWith('+') ? 'added' : line.startsWith('-') ? 'removed' : ''}>{line}{'\n'}</span>)}</pre>}</section>}</div>)}
  </main>;
}
