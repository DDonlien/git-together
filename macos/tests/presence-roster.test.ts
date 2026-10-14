import test from 'node:test';
import assert from 'node:assert/strict';
import { presenceBranchWorkLabel, presencePeople, type PresenceFile, type PresenceProject, type PresenceSession, type PresenceStatus } from '../src/presence-model';
import { presenceDeviceSources, type ControlDevice } from '../src/remote-control-model';

const repositoryId = 'example.test/team/project';
function file(path: string, change: Partial<PresenceFile> = {}): PresenceFile {
  return { path, git: 'dirty', editor: 'clean', dirty: 'dirty', pending: false, tracked: true, index: ' ', worktree: 'M', activity: 'idle', sources: [], ...change };
}
function project(change: Partial<PresenceProject> = {}): PresenceProject {
  return { repositoryId, worktreeId: 'worktree-a', branch: 'main', head: 'a'.repeat(40), gitReady: true, unpublishedCommits: 0, files: [file('a.ts')], ...change };
}
function session(projects: PresenceProject[], change: Partial<PresenceSession> = {}): PresenceSession {
  return { sessionId: 'session-a', userId: 'user-a', displayName: 'User', avatarUrl: null, deviceId: 'device-a', deviceName: 'Device A', alive: true, lastSeen: 1, projects, ...change };
}
function status(sessions: PresenceSession[]): PresenceStatus {
  return { version: 1, enabled: true, configured: true, serverUrl: 'https://example.test', serverName: 'fixture', connection: 'connected', error: '', sessions, bridge: { connected: true, error: '', projects: [] } };
}

test('the roster reports the actual dirty file count without counting clean files', () => {
  const files = [...Array.from({ length: 20 }, (_, i) => file(`${i}.ts`)), file('clean.ts', { git: 'clean', dirty: 'clean', worktree: ' ' })];
  const [person] = presencePeople(status([session([project({ files })])]), repositoryId, 'main');
  assert.equal(person.branches[0].changedFileCount, 20);
  assert.equal(presenceBranchWorkLabel(person.branches[0]), '20 个文件未 Commit');
});

test('duplicate sessions do not double count the same device and worktree', () => {
  const work = project({ files: [file('a.ts'), file('b.ts')] });
  const [person] = presencePeople(status([session([work]), session([work], { sessionId: 'duplicate' }), session([project({ worktreeId: 'worktree-b' })], { sessionId: 'other-worktree' })]), repositoryId);
  assert.equal(person.branches[0].sources.length, 2);
  assert.equal(person.branches[0].changedFileCount, 3);
});

test('same branch changes in separate devices remain separate worktree sources', () => {
  const [person] = presencePeople(status([session([project()]), session([project()], { sessionId: 'session-b', deviceId: 'device-b', deviceName: 'Device B' })]), repositoryId);
  assert.deepEqual(person.deviceNames, ['Device A', 'Device B']);
  assert.equal(person.branches[0].changedFileCount, 2);
});

test('editing keeps its ring priority while the label still reports uncommitted files', () => {
  const [person] = presencePeople(status([session([project({ files: [file('editing.ts', { activity: 'editing' })] })])]), repositoryId);
  assert.equal(person.state, 'editing');
  assert.equal(presenceBranchWorkLabel(person.branches[0]), '1 个文件未 Commit');
});

test('pending, unknown and unready snapshots never produce a precise count', () => {
  for (const work of [project({ files: [file('confirmed.ts'), file('pending.ts', { pending: true })] }), project({ files: [file('confirmed.ts'), file('unknown.ts', { git: 'unknown' })] }), project({ gitReady: false, files: [file('editing.ts', { activity: 'editing' })] })]) {
    const [person] = presencePeople(status([session([work])]), repositoryId);
    assert.equal(person.branches[0].changedFileCount, null);
    assert.doesNotMatch(presenceBranchWorkLabel(person.branches[0]), /\d/);
  }
});

test('branch filtering and liveness exclude unrelated and stale counts', () => {
  const data = status([session([project(), project({ branch: 'feature', worktreeId: 'feature-worktree', files: [file('a'), file('b')] })]), session([project()], { sessionId: 'stale', alive: false })]);
  assert.equal(presencePeople(data, repositoryId).flatMap(person => person.branches).length, 2);
  assert.equal(presencePeople(data, repositoryId, 'feature')[0].branches[0].changedFileCount, 2);
  assert.equal(presencePeople({ ...data, connection: 'offline' }, repositoryId).length, 0);
});

test('current-device sources use the same server, device and account boundary as remote actions', () => {
  const [person] = presencePeople(status([session([project()], { serverId: 'server-a', identityId: 'identity-a' })]), repositoryId);
  const device: ControlDevice = { serverId: 'server-a', deviceId: 'device-a', userId: 'user-a', identityId: 'identity-a', isCurrent: true, name: 'Device A', online: true, lastSeen: 1, workspaces: [] };
  assert.equal(presenceDeviceSources(device, person.branches[0]).length, 1);
  for (const mismatch of [{ serverId: 'server-b' }, { deviceId: 'device-b' }, { userId: 'user-b' }, { identityId: 'identity-b' }]) {
    assert.equal(presenceDeviceSources({ ...device, ...mismatch }, person.branches[0]).length, 0);
  }
});
