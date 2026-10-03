import { useMemo, useState } from 'react';
import type { ChangeFile, Commit, Worktree } from './domain';
import { Button, Icon, IconButton, SearchInput, Segmented } from './ui';

type TreeNode = { name: string; path: string; children: TreeNode[]; file?: ChangeFile };
function buildTree(files: ChangeFile[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', children: [] };
  const all = [...files, { id: 'project', name: 'BallMaze.uproject', path: '', kind: 'text' as const, tracked: true, selected: false, added: 0, removed: 0, size: '1 KB', change: 'modified' as const }];
  for (const file of all) {
    let parent = root;
    const parts = `${file.path}${file.name}`.split('/');
    parts.forEach((part, i) => {
      let node = parent.children.find(n => n.name === part);
      if (!node) { node = { name: part, path: parts.slice(0, i + 1).join('/'), children: [] }; parent.children.push(node); }
      if (i === parts.length - 1) node.file = file;
      parent = node;
    });
  }
  const order = (nodes: TreeNode[]) => { nodes.sort((a, b) => Number(!!a.file) - Number(!!b.file) || a.name.localeCompare(b.name)); nodes.forEach(n => order(n.children)); };
  order(root.children); return root.children;
}

function Tree({ nodes, level, expanded, toggle, selectedFile, onFile }: { nodes: TreeNode[]; level: number; expanded: string[]; toggle: (path: string) => void; selectedFile?: string; onFile: (file: ChangeFile) => void }) {
  return <div role={level === 0 ? 'tree' : 'group'}>{nodes.map(node => <div key={node.path} role="treeitem" aria-expanded={node.file ? undefined : expanded.includes(node.path)} aria-selected={!!node.file && node.file.id === selectedFile}><button className={`tree-row ${node.file && node.file.id === selectedFile ? 'active' : ''}`} style={{ paddingLeft: 12 + level * 16 }} onClick={() => node.file ? onFile(node.file) : toggle(node.path)}>
    {!node.file ? <Icon name={expanded.includes(node.path) ? 'down' : 'right'} size={11} /> : <span className="tree-spacer" />}<Icon name={!node.file ? 'folder' : node.file.kind === 'binary' ? 'cube' : node.file.kind === 'image' ? 'image' : 'code'} size={16} className={!node.file ? 'folder-icon' : 'muted'} /><span>{node.name}</span>{node.file && node.file.id !== 'project' && <span className="file-change-tag">{node.file.tracked ? 'M' : 'U'}</span>}
  </button>{node.children.length > 0 && expanded.includes(node.path) && <Tree nodes={node.children} level={level + 1} expanded={expanded} toggle={toggle} selectedFile={selectedFile} onFile={onFile} />}</div>)}</div>;
}

export function Details({ worktree, tab, setTab, selectedFile, onFile, onClose }: { worktree: Worktree; tab: 'graph' | 'tree'; setTab: (tab: 'graph' | 'tree') => void; selectedFile?: string; onFile: (file: ChangeFile) => void; onClose: () => void }) {
  const [commit, setCommit] = useState<Commit | null>(null);
  const [copied, setCopied] = useState(false);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(['Content', 'Content/Blueprints', 'Content/UI', 'Source', 'Source/BallMaze', 'Config', 'Docs']);
  const nodes = useMemo(() => buildTree(worktree.files.filter(f => `${f.path}${f.name}`.toLowerCase().includes(search.toLowerCase()))), [worktree.files, search]);
  const commits = worktree.commits;
  const branchOrder = [...new Set(commits.map(c => c.branch))];
  const lane = (c: Commit) => branchOrder.indexOf(c.branch) % 2 === 0 ? 19 : 43;
  const stroke = (c: Commit) => branchOrder.indexOf(c.branch) % 2 === 0 ? '#7161db' : '#4580e5';
  return <aside className="details-panel">
    <div className="details-header"><Segmented<'graph' | 'tree'> className="details-segmented" aria-label="详情视图" value={tab} onValueChange={value => { setTab(value); setCommit(null); }} items={[{value:'graph',label:'Git Graph'},{value:'tree',label:'文件夹'}]} /><IconButton icon="sidebar" label="收起详情栏" onClick={onClose} /></div>
    {tab === 'graph' ? <><div className="panel-heading"><h3>History</h3><span className="muted"><Icon name="arrowUp" size={12} /> 最新在上</span></div><div className="graph-branches">{branchOrder.slice(0, 2).map((branch, i) => <span key={branch} style={{ color: i ? '#4580e5' : '#7161db', backgroundColor: i ? '#4580e50b' : '#7161db0b' }} title={branch}><Icon name="branch" size={12} />{branch}</span>)}</div>
    <div className="commit-graph" aria-label="提交历史图"><svg className="graph-lines" width="65" height={commits.length * 75 + 14} aria-hidden="true">{commits.map((c, index) => <g key={c.id}>{c.parents.map(parentId => {
      const parentIndex = commits.findIndex(p => p.id === parentId); if (parentIndex < 0) return null;
      const parent = commits[parentIndex], x = lane(c), y = index * 75 + 26, px = lane(parent), py = parentIndex * 75 + 26;
      return <path key={parentId} d={x === px ? `M ${x} ${y} L ${px} ${py}` : `M ${x} ${y} L ${x} ${py - 16} Q ${x} ${py} ${px} ${py}`} fill="none" stroke={stroke(c)} strokeWidth="1.8" />;
    })}<circle cx={lane(c)} cy={index * 75 + 26} r={index === 0 ? 5 : 4} fill={stroke(c)} stroke="var(--content)" strokeWidth="2" /></g>)}</svg><div className="commit-list">{commits.map((c, index) => <button key={c.id} className={`graph-commit ${commit?.id === c.id ? 'active' : ''}`} onClick={() => { setCommit(commit?.id === c.id ? null : c); setCopied(false); }}><strong>{c.summary}</strong><span>{c.time} · {c.author}{index === 0 && <span className="head-label">HEAD</span>}</span><code>{c.id}</code></button>)}</div></div>
    {commit && <section className="commit-inspector"><div className="panel-heading"><h4>提交详情</h4><IconButton icon="close" label="关闭提交详情" onClick={() => setCommit(null)} /></div><p>{commit.description}</p><Button variant="quiet" className="text-button" onClick={() => void navigator.clipboard.writeText(commit.id).then(() => setCopied(true))}><Icon name="copy" size={13} />{copied ? '已复制' : commit.id}</Button><span className="muted">{commit.files.length} 个文件 · {commit.branch}</span>{commit.files.map(f => <div className="commit-file" key={f.id}><Icon name="file" size={12} />{f.name}</div>)}</section>}
    </> : <><div className="panel-heading"><h3>Files</h3><span className="muted">目录树</span></div><div className="tree-search"><SearchInput value={search} onChange={setSearch} placeholder="查找文件…" /></div><div className="tree-root"><Icon name="folder" size={16} /><strong>{worktree.label}</strong></div><div className="file-tree"><Tree nodes={nodes} level={0} expanded={expanded} toggle={path => setExpanded(expanded.includes(path) ? expanded.filter(p => p !== path) : [...expanded, path])} selectedFile={selectedFile} onFile={f => { if (f.id !== 'project') onFile(f); }} /></div><div className="tree-note"><Icon name="file" size={13} />M 已修改 · U 未跟踪<br />点击文件查看更改，勾选决定本次提交。</div></>}
    <footer className="details-footer"><span><Icon name="branch" size={13} /> {worktree.branch}</span><code>HEAD {commits[0]?.id || '—'}</code></footer>
  </aside>;
}
