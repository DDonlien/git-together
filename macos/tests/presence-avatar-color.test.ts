import test from 'node:test';
import assert from 'node:assert/strict';
import { presencePeople, type PresenceProject, type PresenceSession, type PresenceStatus } from '../src/presence-model';

const repositoryA = 'example.test/team/repository-a';
const repositoryB = 'example.test/team/repository-b';
function project(change: Partial<PresenceProject> = {}): PresenceProject {
  return { repositoryId: repositoryA, worktreeId: 'worktree-a', branch: 'main', head: 'a'.repeat(40), gitReady: true, unpublishedCommits: 1, files: [], ...change };
}
function session(change: Partial<PresenceSession> = {}): PresenceSession {
  return { serverId: 'server-a', sessionId: 'session-a', identityId: 'identity-a', userId: 'user-a', displayName: 'Taobe', avatarUrl: null, deviceId: 'device-a', deviceName: 'Mac', alive: true, lastSeen: 1, projects: [project()], ...change };
}
function status(sessions: PresenceSession[]): PresenceStatus {
  return { version: 1, enabled: true, configured: true, serverUrl: 'https://example.test', serverName: 'fixture', connection: 'connected', error: '', sessions, bridge: { connected: true, error: '', projects: [] } };
}

test('one person and device keep the same color across repositories, branches, worktrees and organizations', () => {
  const data = status([session({ projects: [project(), project({ repositoryId: repositoryB, branch: 'feature', worktreeId: 'worktree-b', organizationId: 'org-b' })] })]);
  const first = presencePeople(data, repositoryA)[0];
  assert.ok(first.color);
  assert.equal(presencePeople(data, repositoryB)[0].color, first.color);
  assert.equal(presencePeople(data, repositoryB, 'feature')[0].color, first.color);
});

test('two devices of the same person receive their own colors even when their names match', () => {
  const people = presencePeople(status([session(), session({ sessionId: 'session-b', deviceId: 'device-b' })]), repositoryA);
  assert.equal(people.length, 2);
  assert.notEqual(people[0].color, people[1].color);
});

test('different people using the same device ID do not share a color', () => {
  const people = presencePeople(status([session(), session({ sessionId: 'session-other', identityId: 'identity-other', userId: 'user-other' })]), repositoryA);
  assert.equal(people.length, 2);
  assert.notEqual(people[0].color, people[1].color);
});

test('new sessions, renamed devices, activity changes and a reordered roster do not recolor a device', () => {
  const original = presencePeople(status([session()]), repositoryA)[0].color;
  const changed = session({ sessionId: 'reconnected-session', displayName: 'Renamed user', deviceName: 'Renamed Mac', projects: [project({ unpublishedCommits: 0, files: [{ path: 'a.ts', git: 'dirty', editor: 'clean', dirty: 'dirty', pending: false, tracked: true, index: ' ', worktree: 'M', activity: 'editing', sources: [] }] })] });
  const people = presencePeople(status([session({ identityId: 'new-person', deviceId: 'new-device' }), changed]), repositoryA);
  const sameDevice = people.find(person => person.deviceName === 'Renamed Mac')!;
  assert.equal(sameDevice.state, 'editing');
  assert.equal(sameDevice.color, original);
  assert.equal(presencePeople(status([changed]), repositoryA)[0].color, original);
});

test('a hidden, clean or disconnected device retains its color when it reappears', () => {
  const original = presencePeople(status([session()]), repositoryA)[0].color;
  assert.deepEqual(presencePeople(status([session({ projects: [project({ unpublishedCommits: 0 })] })]), repositoryA), []);
  assert.deepEqual(presencePeople({ ...status([session()]), connection: 'offline' }, repositoryA), []);
  assert.deepEqual(presencePeople(status([session({ isCurrent: true })]), repositoryA, undefined, { excludeCurrent: true }), []);
  presencePeople(status([session({ identityId: 'another-person', deviceId: 'another-device' })]), repositoryA);
  assert.equal(presencePeople(status([session()]), repositoryA)[0].color, original);
});

test('federated identities share device colors across servers while legacy server-local users stay separate', () => {
  const federated = presencePeople(status([session(), session({ serverId: 'server-b', userId: 'server-b-user' })]), repositoryA);
  assert.equal(federated.length, 2);
  assert.equal(federated[0].color, federated[1].color);
  const legacy = presencePeople(status([session({ identityId: undefined }), session({ identityId: undefined, serverId: 'legacy-server-b' })]), repositoryA);
  assert.equal(legacy.length, 2);
  assert.notEqual(legacy[0].color, legacy[1].color);
});
