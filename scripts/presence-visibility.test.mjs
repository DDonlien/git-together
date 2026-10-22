import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(join(root, 'desktop/package.json'));
const ts = require('typescript');
const exports = {};
new Function('exports', ts.transpileModule(readFileSync(join(root, 'macos/src/presence-model.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(exports);
const { presencePeople, presenceWorkspaces } = exports;
const repositoryId = 'git.example.invalid/team/project';
const project = (overrides = {}) => ({ repositoryId, worktreeId: 'worktree-main', branch: 'main', head: 'a'.repeat(40), gitReady: true, unpublishedCommits: 0, files: [], ...overrides });
const changed = () => project({ files: [{ path: 'a.ts', git: 'dirty', editor: 'unknown', dirty: 'dirty', pending: false, tracked: true, index: '', worktree: '', activity: 'idle', sources: [] }] });
const session = (overrides = {}) => ({ sessionId: 'session', userId: 'same-user', identityId: 'same-identity', serverId: 'server', displayName: 'Taobe', avatarUrl: null, deviceId: 'other-device', deviceName: 'Mac', alive: true, lastSeen: 1, projects: [changed()], ...overrides });
const status = (overrides = {}) => ({ version: 1, enabled: true, configured: true, connection: 'connected', error: '', sessions: [], bridge: { connected: false, error: '', projects: [] }, servers: [{ id: 'server', enabled: true, connection: 'connected', error: '' }], ...overrides });

test('overview excludes this instance while preserving another device of the same account and name', () => {
  const state = status({ sessions: [session({ isCurrent: true, deviceId: 'this-device' }), session()] });
  assert.equal(presencePeople(state, repositoryId).length, 2);
  const remote = presencePeople(state, repositoryId, undefined, { excludeCurrent: true });
  assert.equal(remote.length, 1);
  assert.equal(remote[0].branches[0].sources[0].deviceId, 'other-device');
  assert.equal(presencePeople(state, repositoryId, 'different', { excludeCurrent: true }).length, 0);
  assert.equal(presencePeople(status({ sessions: [session({ isCurrent: true })] }), repositoryId, undefined, { excludeCurrent: true }).length, 0);
});

test('clean workspaces count as online in details without generating activity avatars', () => {
  const state = status({ sessions: [session({ projects: [project()] })] });
  assert.equal(presencePeople(state, repositoryId).length, 0);
  assert.equal(presenceWorkspaces(state, repositoryId).filter(row => row.connection === 'online').length, 1);
});

test('details show clean local workspaces while disconnected and deduplicate server echoes across scopes', () => {
  const local = project();
  const state = status({ connection: 'offline', local: { deviceId: 'this-device', deviceName: 'This Mac', connected: true, projects: [local] }, sessions: [
    session({ isCurrent: true, projects: [local] }),
    session({ isCurrent: true, serverId: 'second-server', projects: [project({ organizationId: 'organization' })] }),
    session({ deviceId: 'remote', projects: [project()] }),
  ] });
  const rows = presenceWorkspaces(state, repositoryId);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].isCurrent, true);
  assert.equal(rows[0].connection, 'online');
  assert.equal(rows[1].connection, 'unknown');
  assert.equal(presencePeople(state, repositoryId).length, 0);
  assert.equal(presenceWorkspaces({ ...state, local: { ...state.local, connected: false } }, repositoryId).some(row => row.connection === 'online'), false);
});

test('one healthy server never makes another server offline sessions appear online', () => {
  const state = status({ servers: [
    { id: 'server', enabled: true, connection: 'connected' },
    { id: 'offline-server', enabled: true, connection: 'offline' },
    { id: 'disabled-server', enabled: false, connection: 'connected' },
  ], sessions: [session(), session({ serverId: 'offline-server' }), session({ serverId: 'disabled-server' }), session({ serverId: 'server', alive: false })] });
  assert.equal(presencePeople(state, repositoryId).length, 1);
  assert.deepEqual(presenceWorkspaces(state, repositoryId).map(row => row.connection), ['online', 'unknown', 'unknown', 'offline']);
});

test('activity still aggregates per device and worktree, retaining editing priority and exact counts', () => {
  const first = changed();
  const second = project({ worktreeId: 'worktree-feature', branch: 'feature', unpublishedCommits: 3, files: [{ ...first.files[0], git: 'clean', activity: 'editing' }] });
  const state = status({ sessions: [session({ projects: [first, first, second] })] });
  const people = presencePeople(state, repositoryId, undefined, { excludeCurrent: true });
  assert.equal(people.length, 1);
  assert.equal(people[0].state, 'editing');
  assert.deepEqual(people[0].branches.find(branch => branch.branch === 'main').counts, { editingFiles: 0, changedFiles: 1, unpublishedCommits: 0 });
  assert.deepEqual(people[0].branches.find(branch => branch.branch === 'feature').counts, { editingFiles: 1, changedFiles: 0, unpublishedCommits: 3 });
});

test('disabled presence and unrelated repository data produce no detail rows or avatars', () => {
  const state = status({ enabled: false, sessions: [session()], local: { connected: true, projects: [project()] } });
  assert.deepEqual(presenceWorkspaces(state, repositoryId), []);
  assert.deepEqual(presencePeople(state, repositoryId), []);
  assert.deepEqual(presenceWorkspaces(status({ sessions: [session()] }), 'git.example.invalid/other/project'), []);
});

const key = 'fixture-presence-visibility-key';
function configuration() {
  return { version: 1, enabled: true, serverUrl: 'http://127.0.0.1:9/', serverName: 'Fixture', serverToken: '', deviceId: 'fixture-local', servers: [], account: {
    id: 'fixture-user', identityId: 'fixture-identity', email: 'fixture@example.invalid', displayName: 'Fixture', emailVerified: true, expiresAt: Date.now() + 60_000, repositories: [], mode: 'personal',
  } };
}
function helper(t, config, callback) {
  const directory = mkdtempSync(join(tmpdir(), 'gittogether-presence-visibility-'));
  const nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm', createHash('sha256').update(key).digest(), nonce);
  writeFileSync(join(directory, 'presence-v1.encrypted'), Buffer.concat([Buffer.from('GTP1'), nonce, cipher.update(JSON.stringify(config)), cipher.final(), cipher.getAuthTag()]));
  const child = spawn(join(root, 'desktop/gittogether-presence/target/debug/gittogether-presence'), [directory, directory], {
    env: { ...process.env, GITTOGETHER_PRESENCE_CONFIG_DIR: join(directory, 'editor') }, stdio: 'pipe',
  });
  const pending = new Map(), calls = [];
  let stderr = '', sequence = 0;
  child.stderr.on('data', bytes => { stderr += bytes; });
  child.on('error', error => { for (const item of pending.values()) item.reject(error); });
  child.on('exit', () => { for (const item of pending.values()) item.reject(new Error('Presence exited: ' + stderr)); pending.clear(); });
  createInterface({ input: child.stdout }).on('line', async line => {
    const message = JSON.parse(line);
    if (!message.callbackId) {
      const item = pending.get(message.id);
      if (item) { pending.delete(message.id); item.resolve(message); }
      return;
    }
    calls.push(message);
    try {
      const value = message.method === 'storageKey' ? key : await callback(message.method, message.input);
      child.stdin.write(JSON.stringify({ callbackId: message.callbackId, ok: true, value }) + '\n');
    } catch (error) {
      child.stdin.write(JSON.stringify({ callbackId: message.callbackId, ok: false, error: error.message }) + '\n');
    }
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exited;
    }
    rmSync(directory, { recursive: true, force: true });
  });
  return { calls, command: (method = 'status', input = {}) => new Promise((resolve, reject) => {
    const id = String(++sequence);
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Presence timed out: ' + stderr)); }, 5000);
    pending.set(id, { resolve: message => { clearTimeout(timer); resolve(message); }, reject: error => { clearTimeout(timer); reject(error); } });
    child.stdin.write(JSON.stringify({ id, group: 'presence', method, input }) + '\n');
  }) };
}
async function until(helper, predicate) {
  const deadline = Date.now() + 7000;
  let value;
  do {
    const reply = await helper.command(); assert.equal(reply.ok, true, reply.error); value = reply.value;
    if (predicate(value)) return value;
    await delay(40);
  } while (Date.now() < deadline);
  assert.fail('Presence condition timed out: ' + JSON.stringify(value));
}
const nativeOptions = { skip: process.platform === 'win32' ? 'Uses isolated macOS/Linux GCM fixture' : false, timeout: 15_000 };

test('native collector shows clean and changed local projects without any server and skips unlinked repositories', nativeOptions, async t => {
  const catalog = { revision: 1, repositories: ['clean', 'dirty', 'unlinked'].map(id => ({ id, available: true, url: `https://git.example.invalid/team/${id}` })), links: ['clean', 'dirty'].map(repositoryId => ({ repositoryId })) };
  const process = helper(t, configuration(), async (method, input) => {
    if (method === 'catalog') return catalog;
    if (method === 'tasks') {
      assert.notEqual(input.repositoryId, 'unlinked');
      return [{ path: '/fixture/' + input.repositoryId, branch: 'main', head: 'a'.repeat(40), files: input.repositoryId === 'dirty' ? [{ path: 'draft.ts', tracked: true }] : [] }];
    }
    if (method === 'unpublished') return 0;
    assert.fail('Unexpected callback ' + method);
  });
  const state = await until(process, state => state.local?.projects.length === 2);
  assert.equal(state.local.connected, true);
  assert.equal(state.localError, '');
  assert.equal(state.local.projects.find(project => project.repositoryId.endsWith('/clean')).files.length, 0);
  assert.equal(state.local.projects.find(project => project.repositoryId.endsWith('/dirty')).files.length, 1);
  assert.equal(state.sessions.length, 0, 'local data must not depend on a server echo');
  assert.equal((await process.command('configure', { enabled: false })).value.local, null);
});

test('a failed linked repository retains its error without suppressing another healthy local project', nativeOptions, async t => {
  const catalog = { revision: 1, repositories: ['healthy', 'failed'].map(id => ({ id, available: true, url: `https://git.example.invalid/team/${id}` })), links: ['healthy', 'failed'].map(repositoryId => ({ repositoryId })) };
  const process = helper(t, configuration(), async (method, input) => {
    if (method === 'catalog') return catalog;
    if (method === 'unpublished') return 0;
    if (method === 'tasks') {
      if (input.repositoryId === 'failed') throw new Error('fixture directory unavailable');
      return [{ path: '/fixture/healthy', branch: 'main', head: 'a'.repeat(40), files: [] }];
    }
    assert.fail('Unexpected callback ' + method);
  });
  const state = await until(process, state => state.local?.projects.length === 1 && state.localError);
  assert.match(state.localError, /fixture directory unavailable/);
  assert.equal(state.local.projects[0].repositoryId, 'git.example.invalid/team/healthy');
});

test('native current-device detection uses the matching server binding, preserving another device of the same account', nativeOptions, async t => {
  const WebSocketServer = require('ws').Server;
  async function server(deviceIds) {
    const http = createServer((_request, response) => { response.writeHead(404, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ message: 'fixture route unavailable' })); });
    const sockets = new WebSocketServer({ server: http });
    sockets.on('connection', socket => {
      let revision = 0;
      const send = () => socket.send(JSON.stringify({ type: 'world', version: 3, revision: ++revision, organizations: [], sessions: deviceIds.map(deviceId => session({ sessionId: deviceId, userId: 'fixture-user', identityId: 'fixture-identity', deviceId, isCurrent: true, projects: [project()] })) }));
      socket.on('message', bytes => {
        const message = JSON.parse(String(bytes));
        if (message.type === 'bridge') { socket.send(JSON.stringify({ type: 'welcome', version: 3, sessionId: 'fixture-session', heartbeatMs: 100, ttlMs: 1000 })); send(); }
        else if (message.type === 'heartbeat') send();
      });
    });
    await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
    t.after(async () => { for (const socket of sockets.clients) socket.terminate(); sockets.close(); await new Promise(resolve => http.close(resolve)); });
    return `http://127.0.0.1:${http.address().port}/`;
  }
  const first = await server(['fixture-local', 'registered-a', 'other-device']);
  const second = await server(['registered-a', 'registered-b']);
  const config = configuration(); config.serverUrl = first;
  config.servers = [[first, 'registered-a'], [second, 'registered-b']].map(([url, deviceId]) => ({ url, enabled: true, token: 't'.repeat(32), expiresAt: Date.now() + 60_000, userId: 'fixture-user', deviceId, deviceToken: 'd'.repeat(32), organizations: [] }));
  const process = helper(t, config, async method => {
    if (method === 'catalog') return { revision: 1, repositories: [], links: [] };
    assert.fail('Unexpected callback ' + method);
  });
  const state = await until(process, value => value.sessions.length === 5);
  const firstId = createHash('sha256').update(first).digest('hex');
  const rows = state.sessions.map(value => [value.serverId === firstId ? 'first' : 'second', value.deviceId, value.isCurrent]);
  assert.deepEqual(rows.sort(), [['first', 'fixture-local', true], ['first', 'other-device', false], ['first', 'registered-a', true], ['second', 'registered-a', false], ['second', 'registered-b', true]].sort());
});
