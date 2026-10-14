import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MaterialProvider, Button } from '../src/ui';
import { RepositoryActionDraftsProvider } from '../src/RepositoryActionDialog';
import { RepositoryOperationProvider, useRepositoryOperations } from '../src/RepositoryOperationProvider';
import { useWorkspace } from '../src/use-workspace';
import type { Catalog } from '../src/import-model';
import type { RepositoryTask, RepositoryWorkspace } from '../src/repository-model';
import type { CommitDraft, GenerateCommitMessage } from '../src/local-submit-model';
import pkg from '../package.json';
import 'open-glass-ui/styles.css';
import '../src/styles.css';

const names = ['alpha', 'beta', 'gamma'];
const task = (name: string, branch = 'main'): RepositoryTask => ({ id: `worktree:${branch}:D:\\fixture\\${name}-${branch}`, path: `D:\\fixture\\${name}-${branch}`, branch, head: 'a'.repeat(40), changeKey: 'b'.repeat(64), files: [{ path: 'one.txt', status: 'M', tracked: true }, { path: 'two.txt', status: '??', tracked: false }], tree: ['one.txt', 'two.txt'], error: '' });
const workspaces = Object.fromEntries(names.map(name => [name, { source: 'local', complete: true, commits: [], tasks: name === 'alpha' ? [task(name), task(name, 'feature/test')] : [task(name)] } satisfies RepositoryWorkspace]));
const catalog: Catalog = { instanceId: 'fixture', revision: 1, credentialStorage: 'session', accounts: [{ id: 'fixture-account', provider: 'gitea', host: 'https://fixture.invalid', login: 'fixture', name: 'Fixture', updatedAt: new Date().toISOString() }], repositories: names.map((name, index) => ({ id: name, remoteId: index, accountId: 'fixture-account', name, fullName: `fixture/${name}`, description: '', defaultBranch: 'main', private: false, url: `https://fixture.invalid/fixture/${name}`, available: true })), links: names.map(name => ({ repositoryId: name, path: task(name).path!, worktrees: workspaces[name].tasks.map(task => ({ branch: task.branch, path: task.path! })) })) };
const counts: Record<string, Record<string, number>> = {};
const pending: { name: string; resolve: (value: CommitDraft) => void; signal: AbortSignal }[] = [];
let finishCommit: (() => void) | undefined, finishPush: (() => void) | undefined;
let notify = () => {};
let failPush = false;
window.gittogether = {
  environment: async () => ({ nativeGlass: false, platform: 'win32' }), setTheme: async () => {}, chooseDirectory: async () => null,
  openGithubAuthorization: async () => {}, updates: { status: async () => { throw new Error('fixture updates disabled'); }, check: async () => { throw new Error('fixture updates disabled'); }, download: async () => { throw new Error('fixture updates disabled'); }, install: async () => { throw new Error('fixture updates disabled'); } },
  import: async (method, raw) => {
    const input = raw as { repositoryId?: string; taskId?: string; commitId?: string };
    const name = input.repositoryId || 'service';
    (counts[name] ||= {})[method] = (counts[name]?.[method] || 0) + 1; notify();
    let value: unknown;
    if (method === 'status') value = { instanceId: 'fixture', version: pkg.version, githubWebAuth: true };
    else if (method === 'catalog' || method === 'refresh') value = catalog;
    else if (method === 'localWorkspace') value = workspaces[name];
    else if (method === 'remoteWorkspace') value = { source: 'remote', complete: true, tasks: [], commits: [], warnings: [], checkedAt: Date.now() };
    else if (method === 'fetchRepository') value = { branches: 1, checkedAt: Date.now() };
    else if (method === 'submitCommit') {
      await new Promise<void>(done => { finishCommit = done; });
      value = { taskId: input.taskId, commitId: 'c'.repeat(40), branch: 'main' };
    } else if (method === 'pushCommit') {
      await new Promise<void>(done => { finishPush = done; });
      if (failPush) { failPush = false; return { ok: false, error: 'fixture push failed' }; }
      value = { taskId: input.taskId, commitId: input.commitId, branch: 'main', pushed: true };
    } else throw new Error(`Unexpected fixture method: ${method}`);
    return { ok: true, value };
  },
};

function Controls({ controller }: { controller: ReturnType<typeof useWorkspace> }) {
  const operations = useRepositoryOperations(); const [, render] = useState(0); notify = () => render(value => value + 1);
  const generate: GenerateCommitMessage = async (input, signal) => {
    (counts[input.repositoryId] ||= {}).generate = (counts[input.repositoryId]?.generate || 0) + 1; notify();
    return new Promise<CommitDraft>((resolve, reject) => {
      pending.push({ name: input.repositoryId, resolve, signal });
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  };
  const open = (name: string, branch = 'main') => operations.open({ mode: 'submit', scope: `${name}:${branch}`, targets: [{ repositoryId: name, repositoryName: `fixture/${name}`, task: task(name, branch) }], onCommit: controller.submitCommit, onPush: controller.pushCommit, onGenerate: generate });
  return <main style={{ padding: 24 }}><h1>隔离 Submit 回归</h1><p>使用生产弹窗和共享读取控制器，所有写入与生成均为受控回调。</p>
    {names.map(name => <Button key={name} onClick={() => open(name)}>打开 {name}</Button>)}<Button onClick={() => open('alpha', 'feature/test')}>打开 alpha 第二目录</Button>
    <Button onClick={() => { const item = pending.find(item => !item.signal.aborted); if (item) { pending.splice(pending.indexOf(item), 1); item.resolve({ summary: `AI ${item.name}`, description: '后台任务结果' }); } }}>完成生成</Button>
    <Button onClick={() => { finishCommit?.(); finishCommit = undefined; }}>完成 Commit</Button><Button onClick={() => { finishPush?.(); finishPush = undefined; }}>完成 Push</Button><Button onClick={() => { failPush = true; }}>下一次 Push 失败</Button>
    <output aria-label="暂停仓库">{JSON.stringify([...controller.pausedRepositories])}</output><pre aria-label="调用次数">{JSON.stringify(counts)}</pre>
  </main>;
}
function Preview() {
  const controller = useWorkspace();
  return <MaterialProvider appearance="dark"><RepositoryActionDraftsProvider sessionId={controller.catalog.instanceId}><RepositoryOperationProvider sessionId={controller.catalog.instanceId} pauseRepositoryRefresh={controller.pauseRepositoryRefresh}><Controls controller={controller} /></RepositoryOperationProvider></RepositoryActionDraftsProvider></MaterialProvider>;
}
const root = createRoot(document.getElementById('root')!); root.render(<Preview />);
import.meta.hot?.dispose(() => root.unmount());
