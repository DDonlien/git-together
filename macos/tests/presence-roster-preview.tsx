import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PresenceAvatarGroup } from '../src/PresenceAvatars';
import { RemoteControlProvider } from '../src/RemoteControlProvider';
import { Button, MaterialProvider } from '../src/ui';
import { presencePeople, presenceRepositoryId, type PresenceFile, type PresenceProject, type PresenceSession, type PresenceStatus } from '../src/presence-model';
import type { ControlStatus } from '../src/remote-control-model';
import type { RemoteRepository } from '../src/import-model';
import 'open-glass-ui/styles.css';
import '../src/styles.css';
import '../src/presence.css';

const repository: RemoteRepository = { id: 'fixture-repository', remoteId: 1, accountId: 'fixture-account', name: 'meow-generator', fullName: 'fixture/meow-generator', description: '', defaultBranch: 'main', private: true, available: true, url: 'https://example.test/fixture/meow-generator' };
const repositoryId = presenceRepositoryId(repository);
const files: PresenceFile[] = Array.from({ length: 20 }, (_, i) => ({ path: `src/file-${i}.ts`, git: 'dirty', editor: 'clean', dirty: 'dirty', pending: false, tracked: true, index: ' ', worktree: 'M', activity: 'idle', sources: [] }));
const mainProject: PresenceProject = { repositoryId, branch: 'main', worktreeId: 'worktree-a', head: 'a'.repeat(40), gitReady: true, unpublishedCommits: 0, files };
const peers: PresenceSession[] = ['Taobe', 'Alice', 'Bob'].map((displayName, i) => ({ sessionId: `session-${i}`, userId: `user-${i}`, displayName, avatarUrl: null, deviceId: `device-${i}`, deviceName: i === 0 ? 'TAOBEPC' : `Device ${i}`, alive: true, lastSeen: 1, projects: [{ ...mainProject, worktreeId: `worktree-${i}` }] }));
peers[0].projects[0].worktreeId = 'worktree-a';
const controlStatus: ControlStatus = {
  enabled: true, registered: true, connection: 'connected', error: '', deviceId: 'device-0', userId: 'user-0', name: 'TAOBEPC', jobs: [], repositories: [repositoryId], teams: [], localRepositories: [],
  devices: peers.map((peer, i) => ({ deviceId: peer.deviceId, userId: peer.userId, name: peer.deviceName!, isCurrent: i === 0, online: true, lastSeen: 1, workspaces: [{ id: `workspace-${i}`, worktreeId: peer.projects[0].worktreeId, repositoryId, branch: 'main', head: 'a'.repeat(40), teamId: null, actions: ['commit', 'submit'] }] })),
};
controlStatus.devices.push({ serverId: 'server-b', deviceId: 'current-on-server-b', userId: 'user-on-server-b', name: 'TAOBEPC', isCurrent: true, online: true, lastSeen: 1, workspaces: [] });
// A finite mock bridge keeps the production provider isolated from user accounts and Git.
Object.defineProperty(window, 'gittogether', { configurable: true, value: { remoteControl: async (method: string) => {
  if (method !== 'status') throw new Error('隔离预览不执行远程写入');
  return { ok: true, value: controlStatus };
} } });

function Preview() {
  const [count, setCount] = useState(1), [extraBranch, setExtraBranch] = useState(false), [unknown, setUnknown] = useState(false), [dark, setDark] = useState(true), [secondServer, setSecondServer] = useState(false);
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; }, [dark]);
  const sessions = peers.slice(0, count).map((session, index) => ({ ...session, projects: session.projects.map(project => ({ ...project, files: unknown && index === 0 ? [...files, { ...files[0], path: 'pending.ts', pending: true }] : files })) }));
  if (extraBranch) sessions[0].projects.push({ ...mainProject, branch: 'feature', worktreeId: 'feature-worktree', files: files.slice(0, 2) });
  if (secondServer) sessions.push({ ...peers[0], sessionId: 'second-server', serverId: 'server-b', deviceId: 'current-on-server-b', userId: 'user-on-server-b', projects: [mainProject] });
  const status: PresenceStatus = { version: 1, enabled: true, configured: true, connection: 'connected', serverUrl: 'https://example.test', serverName: 'fixture', error: '', sessions, bridge: { connected: true, error: '', projects: [] } };
  return <MaterialProvider appearance={dark ? 'dark' : 'light'}><RemoteControlProvider><main style={{ margin: 24, maxWidth: 800 }}>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 32 }}>
      {[1, 2, 3].map(value => <Button key={value} onClick={() => setCount(value)}>{value} 人</Button>)}
      <Button onClick={() => setExtraBranch(value => !value)}>增加活动分支</Button>
      <Button onClick={() => setUnknown(value => !value)}>切换读取未完成</Button>
      <Button onClick={() => setDark(value => !value)}>切换主题</Button>
      <Button onClick={() => setSecondServer(value => !value)}>增加另一服务器的本机</Button>
    </div>
    <section className="flat-group" style={{ padding: 16, display: 'grid', gap: 24 }}>
      <div className="repository-name-line"><strong>meow-generator</strong><PresenceAvatarGroup repository={repository} people={presencePeople(status, repositoryId)} /></div>
      <div className="branch-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><strong>main</strong><PresenceAvatarGroup repository={repository} branch="main" people={presencePeople(status, repositoryId, 'main')} /></div>
    </section>
  </main></RemoteControlProvider></MaterialProvider>;
}
const root = createRoot(document.getElementById('root')!);
root.render(<Preview />);
import.meta.hot?.dispose(() => root.unmount());
