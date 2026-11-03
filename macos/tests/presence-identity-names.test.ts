import test from 'node:test';
import assert from 'node:assert/strict';
import { presenceIdentityNames, presenceWorkspaces, type PresenceProject, type PresenceServer, type PresenceStatus } from '../src/presence-model';

const project: PresenceProject = { repositoryId: 'example.test/team/repo', worktreeId: 'local', branch: 'main', head: null, gitReady: true, unpublishedCommits: 0, files: [] };
const server = (id: string, displayName: string): PresenceServer => ({ id, url: `https://${id}.example.test/`, enabled: true, connection: 'connected', error: '', loggedIn: true, accountSummary: { displayName, email: `${id}@example.test` } });
const status: PresenceStatus = { version: 1, enabled: true, configured: true, serverUrl: '', serverName: '', connection: 'connected', error: '', sessions: [], bridge: { connected: true, error: '', projects: [] }, local: { deviceId: 'device', deviceName: 'Mac', connected: true, projects: [project] } };

test('local workspace does not attribute multiple independent server accounts to the first account', () => {
  const multi = { ...status, servers: [server('one', 'Alice'), server('two', 'Bob')] };
  assert.deepEqual(presenceIdentityNames(multi), ['Alice', 'Bob']);
  assert.equal(presenceWorkspaces(multi, project.repositoryId)[0].displayName, '我');
  assert.equal(presenceWorkspaces({ ...status, servers: [server('one', 'Alex'), server('two', 'Alex')] }, project.repositoryId)[0].displayName, '我');
  assert.equal(presenceWorkspaces({ ...status, servers: [server('one', 'Alice')] }, project.repositoryId)[0].displayName, 'Alice');
});
