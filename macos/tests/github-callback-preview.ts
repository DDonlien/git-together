import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { createGitHubOAuthServer, previewOrigin } from '../server/github-oauth-dev-server';
import { emptyCatalog } from '../src/import-model';

// Isolated browser QA only: no user credentials or live account service calls.
const held = new Map<string, (response: Response) => void>();
let identityDone!: () => void, importDone!: () => void;
const identityGate = new Promise<void>(resolve => { identityDone = resolve; });
const importGate = new Promise<void>(resolve => { importDone = resolve; });
const server = createGitHubOAuthServer({
  verify: async () => {}, connect: async credential => {
    await identityGate; credential.signal.throwIfAborted(); credential.commit();
    await importGate; return { ...emptyCatalog, instanceId: 'callback-browser-fixture' };
  },
  request: async (url, init) => {
    if (url !== 'https://github.com/login/oauth/access_token') throw new Error('Unexpected fixture endpoint');
    const code = new URLSearchParams(String(init?.body)).get('code')!;
    return new Promise<Response>(resolve => held.set(code, resolve));
  },
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const address = server.address(); if (!address || typeof address === 'string') throw new Error('Fixture address missing');
const origin = `http://127.0.0.1:${address.port}`;
const html = await (await fetch(`${origin}/setup`)).text();
const setupKey = html.match(/X-GitTogether-Setup':"([\w-]+)"/)![1];
await fetch(`${origin}/api/config`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-GitTogether-Setup': setupKey }, body: JSON.stringify({ secret: 'fixture-browser-secret', rotated: true }) });
for (const result of ['success', 'failure']) {
  const { value } = await (await fetch(`${origin}/api/start`, { method: 'POST', headers: { Origin: previewOrigin, 'Content-Type': 'application/json', 'X-GitTogether-Client': '1' }, body: '{}' })).json();
  const state = new URL(value.authorizationURL).searchParams.get('state')!;
  process.stdout.write(`${result}: ${origin}/oauth/github/callback?${new URLSearchParams({ state, code: `fixture-${result}` })}\n`);
}
const commands = createInterface({ input: process.stdin });
commands.on('line', line => {
  if (line === 'exchange' || line === 'success') {
    held.get('fixture-success')?.(Response.json({ access_token: 'ghu_fixture_browser', token_type: 'bearer' }));
    if (line === 'success') { identityDone(); importDone(); }
  }
  else if (line === 'identity') identityDone();
  else if (line === 'import') importDone();
  else if (line === 'failure') held.get('fixture-failure')?.(Response.json({ error: 'incorrect_client_credentials' }));
  else if (line === 'quit') commands.close();
});
commands.on('close', () => { server.closeAllConnections(); server.close(); });
