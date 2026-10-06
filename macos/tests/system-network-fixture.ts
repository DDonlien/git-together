import { app, session } from 'electron';
import assert from 'node:assert/strict';
import { createServer as httpServer, type Server } from 'node:http';
import { createServer as httpsServer } from 'node:https';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { once } from 'node:events';
import { createLoopbackFetch, fetchWithSession, systemFetch } from '../electron/system-network';

// This entry is built/launched only by the test, never by the app or helper.
app.setPath('userData', __dirname); app.setPath('sessionData', __dirname);
app.commandLine.appendSwitch('host-resolver-rules', 'MAP *.network-fixture.test 127.0.0.1');
const servers: Server[] = []; const passed: string[] = [];
async function listen(server: Server) {
  servers.push(server); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address === 'object'); return address.port;
}
app.whenReady().then(async () => {
  app.dock?.hide();
  if (process.argv.includes('--live-connectivity')) {
    // Public, credential-free checks. This is not a real OAuth exchange.
    const liveSession = session.fromPartition('gittogether-oauth-remote', { cache: false });
    const request = fetchWithSession(liveSession);
    const results: { endpoint: string; route: string; status: number; milliseconds: number }[] = [];
    for (const endpoint of ['https://github.com/login/oauth/access_token', 'https://api.github.com/zen']) {
      const route = await liveSession.resolveProxy(endpoint); const started = Date.now();
      const response = await request(endpoint, { redirect: 'error', signal: AbortSignal.timeout(8000) });
      await response.body?.cancel();
      results.push({ endpoint, route: route === 'DIRECT' ? 'direct' : 'proxy', status: response.status, milliseconds: Date.now() - started });
    }
    process.stdout.write(`GITTOGETHER_LIVE_NETWORK=${JSON.stringify(results)}\n`); app.exit(0); return;
  }
  let proxyRequests = 0; let targetRequests = 0; let pacRequests = 0; let proxyPort = 0;
  const targetPort = await listen(httpServer(async (req, res) => {
    if (req.url === '/proxy.pac') {
      pacRequests++; res.setHeader('Content-Type', 'application/x-ns-proxy-autoconfig');
      res.end(`function FindProxyForURL(url, host) { if (host === "direct.network-fixture.test") return "DIRECT"; return "PROXY 127.0.0.1:${proxyPort}"; }`); return;
    }
    targetRequests++;
    if (req.url === '/hang') return;
    if (req.url === '/body-hang') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.write('{'); return; }
    if (req.url === '/redirect') { res.writeHead(302, { Location: '/direct' }); res.end(); return; }
    const chunks: Buffer[] = []; for await (const part of req) chunks.push(Buffer.from(part));
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ transport: 'direct', method: req.method, body: Buffer.concat(chunks).toString('utf8'), cookie: req.headers.cookie || '' }));
  }));
  proxyPort = await listen(httpServer((req, res) => {
    proxyRequests++; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ transport: 'proxy', target: req.url }));
  }));
  const origin = `http://127.0.0.1:${targetPort}`;
  const directSession = session.fromPartition('fixture-direct', { cache: false }); await directSession.setProxy({ mode: 'direct' });
  await directSession.cookies.set({ url: origin, name: 'fixture-cookie', value: 'must-not-be-sent' });
  const direct = fetchWithSession(directSession);
  const response = await direct(new URL(`${origin}/direct`), { method: 'POST', body: new URLSearchParams({ code: 'fixture-code' }), redirect: 'error', signal: AbortSignal.timeout(3000) });
  assert.deepEqual(await response.json(), { transport: 'direct', method: 'POST', body: 'code=fixture-code', cookie: '' });
  assert.equal((await direct(new Request(`${origin}/direct`))).status, 200);
  assert.equal(proxyRequests, 0); passed.push('direct URL/Request, form POST and cookie isolation');

  const remoteSession = session.fromPartition('fixture-proxy', { cache: false });
  await remoteSession.setProxy({ mode: 'fixed_servers', proxyRules: `http=127.0.0.1:${proxyPort}`, proxyBypassRules: '<-loopback>' });
  const remote = fetchWithSession(remoteSession); const before = targetRequests;
  assert.equal((await (await remote(`${origin}/proxied`, { signal: AbortSignal.timeout(3000) })).json()).transport, 'proxy');
  assert.equal(targetRequests, before); assert.equal(proxyRequests, 1); passed.push('configured proxy, no direct credential fallback');

  const pacSession = session.fromPartition('fixture-pac', { cache: false });
  await pacSession.setProxy({ mode: 'pac_script', pacScript: `${origin}/proxy.pac` });
  const pac = fetchWithSession(pacSession);
  assert.equal(await pacSession.resolveProxy(`http://direct.network-fixture.test:${targetPort}/direct`), 'DIRECT');
  assert.equal((await (await pac(`http://direct.network-fixture.test:${targetPort}/direct`, { signal: AbortSignal.timeout(3000) })).json()).transport, 'direct');
  assert.equal((await (await pac(`http://proxy.network-fixture.test:${targetPort}/proxied`, { signal: AbortSignal.timeout(3000) })).json()).transport, 'proxy');
  assert.ok(pacRequests > 0); passed.push('PAC selects both direct and proxy routes');

  await session.defaultSession.setProxy({ mode: 'fixed_servers', proxyRules: `http=127.0.0.1:${proxyPort}`, proxyBypassRules: '<-loopback>' });
  assert.equal((await (await systemFetch(`${origin}/proxied`)).json()).transport, 'proxy');
  const local = await createLoopbackFetch(); const proxyBefore = proxyRequests;
  assert.equal((await (await local(`${origin}/direct`)).json()).transport, 'direct');
  assert.equal(proxyRequests, proxyBefore); passed.push('system session adapter and explicit loopback bypass');

  // A closed proxy must fail; silently using the direct target would hide policy.
  const unavailable = httpServer(); const unavailablePort = await listen(unavailable);
  await new Promise<void>(resolve => unavailable.close(() => resolve()));
  await remoteSession.setProxy({ mode: 'fixed_servers', proxyRules: `http=127.0.0.1:${unavailablePort}`, proxyBypassRules: '<-loopback>' });
  const targetBefore = targetRequests;
  await assert.rejects(remote(`${origin}/direct`, { signal: AbortSignal.timeout(3000) }));
  assert.equal(targetRequests, targetBefore); passed.push('unavailable proxy is an explicit failure');

  await assert.rejects(direct(`${origin}/hang`, { signal: AbortSignal.timeout(100) }));
  const unfinishedBody = await direct(`${origin}/body-hang`, { signal: AbortSignal.timeout(100) });
  await assert.rejects(unfinishedBody.text());
  await assert.rejects(direct(`${origin}/redirect`, { redirect: 'error', signal: AbortSignal.timeout(3000) }));
  const abort = new AbortController(); abort.abort(); await assert.rejects(direct(`${origin}/direct`, { signal: abort.signal }));
  passed.push('header/body timeouts, cancellation and forbidden redirects');

  const tlsPort = await listen(httpsServer({ key: readFileSync(join(__dirname, 'key.pem')), cert: readFileSync(join(__dirname, 'cert.pem')) }, (_req, res) => res.end('must not be accepted')));
  await assert.rejects(direct(`https://127.0.0.1:${tlsPort}/`, { signal: AbortSignal.timeout(3000) }));
  passed.push('untrusted TLS certificate rejected');
  process.stdout.write(`GITTOGETHER_NETWORK_RESULT=${JSON.stringify(passed)}\n`);
  app.exit(0);
}).catch(() => {
  process.stderr.write(`Network fixture failed after ${JSON.stringify(passed)}\n`); app.exit(1);
}).finally(() => { for (const server of servers) { server.closeAllConnections(); server.close(); } });
