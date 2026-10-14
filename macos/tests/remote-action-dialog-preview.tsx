import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RemoteActionDialog } from '../src/RemoteControlProjects';
import { RemoteControlProvider } from '../src/RemoteControlProvider';
import { Button, MaterialProvider } from '../src/ui';
import type { ControlDevice, ControlJob, ControlStatus, ControlWorkspace, RemoteAction } from '../src/remote-control-model';
import 'open-glass-ui/styles.css';
import '../src/styles.css';

const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get('theme') === 'light' ? 'light' : 'dark';
const mode = params.get('mode') || 'ready';
const long = params.has('long');
const action: RemoteAction = params.get('action') === 'discard' ? 'discard' : params.get('action') === 'abort' ? 'abort' : params.get('action') === 'commit' ? 'commit' : 'submit';
const workspace: ControlWorkspace = { id: 'fixture-workspace', repositoryId: 'fixture-repository', branch: long ? 'feature/' + 'long-branch-name-'.repeat(12) : 'main', head: 'a'.repeat(40), teamId: null, actions: ['commit', 'submit', 'abort', 'discard'] };
const device: ControlDevice = { deviceId: 'fixture-target', userId: 'fixture-user', name: long ? 'TaobedeMacBook-Pro.local-' + 'long-device-name-'.repeat(5) : 'TaobedeMacBook-Pro.local', online: true, lastSeen: Date.now(), workspaces: [workspace] };
const files = Array.from({ length: 75 }, (_, index) => ({ path: `folder-${index}/` + 'long-file-name-'.repeat(12) + '.tsx', status: 'M', tracked: true }));
const status: ControlStatus = { enabled: true, registered: true, deviceId: 'fixture-local', userId: 'fixture-user', name: '隔离预览', connection: 'connected', error: '', devices: [device], jobs: [], repositories: [], teams: [], localRepositories: [] };
window.gittogether = {
  environment: async () => ({ nativeGlass: false, platform: 'win32' }), setTheme: async () => {}, chooseDirectory: async () => null, openGithubAuthorization: async () => {},
  import: async () => { throw new Error('隔离布局预览不访问仓库。'); },
  updates: { status: async () => { throw new Error('隔离预览不读取更新。'); }, check: async () => { throw new Error('隔离预览不检查更新。'); }, download: async () => { throw new Error('隔离预览不下载更新。'); }, install: async () => { throw new Error('隔离预览不安装更新。'); } },
  remoteControl: async (method, raw) => {
    if (method === 'status') return { ok: true, value: status };
    if (method !== 'request') throw new Error(`未预期的隔离请求：${method}`);
    const input = raw as ControlJob;
    if (!['preview', 'generate'].includes(input.kind)) throw new Error('隔离布局预览禁止执行远程写入。');
    if (mode === 'error') return { ok: false, error: '目标预览失败：' + 'long-remote-error-context-'.repeat(20) };
    const job: ControlJob = { ...input, status: mode === 'pending' ? 'running' : 'done', expiresAt: Date.now() + 60000, error: '', result: mode === 'pending' ? null : { previewId: 'fixture-preview', branch: workspace.branch, files, summary: '隔离预览摘要', description: '仅检查布局与字段，不访问真实设备或Git。', operation: 'merge' } };
    status.jobs = [job];
    return { ok: true, value: job };
  },
};

function Preview() {
  const [open, setOpen] = useState(true);
  return <MaterialProvider appearance={params.get('theme') === 'light' ? 'light' : 'dark'}><RemoteControlProvider>
    <main style={{ padding: 24 }}><h1>远端操作弹窗隔离回归</h1><p>生产组件与受控预览，不执行远程写入。</p><Button onClick={() => setOpen(true)}>打开远端弹窗</Button><output>{open ? '已打开' : '已关闭'}</output></main>
    {open && <RemoteActionDialog device={device} workspace={workspace} action={action} onClose={() => setOpen(false)} />}
  </RemoteControlProvider></MaterialProvider>;
}
const root = createRoot(document.getElementById('root')!);
root.render(<Preview />);
import.meta.hot?.dispose(() => root.unmount());
