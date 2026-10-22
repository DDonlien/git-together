import assert from 'node:assert/strict';
import https from 'node:https';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { open } from 'node:fs/promises';
import { existsSync, mkdirSync, statSync, readFileSync, writeFileSync, appendFileSync, renameSync, createReadStream, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as pause } from 'node:timers/promises';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(join(root, 'desktop/package.json'));
const { HttpsProxyAgent } = require('https-proxy-agent');
const proxy = process.env.NO_PROXY === '*' ? undefined : process.env.HTTPS_PROXY || process.env.https_proxy;
const agent = proxy ? new HttpsProxyAgent(proxy, { keepAlive: true, maxSockets: 32 }) : new https.Agent({ keepAlive: true, maxSockets: 32 });
const repository = 'DDonlien/git-together';
const gh = args => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GODEBUG: 'http2client=0' } }).trim();
export async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
function request(url, headers = {}) {
  return new Promise((done, reject) => {
    const req = https.get(url, { agent, headers: { 'User-Agent': 'GitTogether release validation', ...headers } }, response => done(response));
    req.on('error', () => reject(new Error('HTTPS transfer connection failed')));
    req.setTimeout(45000, () => req.destroy());
  });
}
async function redirects(initial, headers = {}) {
  let url = new URL(initial);
  for (let attempt = 0; attempt < 6; attempt++) {
    assert.equal(url.protocol, 'https:');
    const response = await request(url, { Range: 'bytes=0-0', ...(url.hostname === 'api.github.com' ? headers : {}) });
    response.resume();
    if ([301, 302, 303, 307, 308].includes(response.statusCode)) { url = new URL(response.headers.location, url); continue; }
    assert.ok([200, 206].includes(response.statusCode), `Download locator returned HTTP ${response.statusCode}`);
    return url;
  }
  throw new Error('Download redirect limit exceeded');
}
function locator(initial, headers) {
  let pending, current;
  return {
    get() {
      if (!pending) {
        const candidate = redirects(initial, headers).then(url => (current = url, url)).catch(error => { if (pending === candidate) pending = undefined; throw error; });
        pending = candidate;
      }
      return pending;
    },
    invalidate(url) { if (current === url) { pending = undefined; current = undefined; } },
  };
}

// Bounded range requests avoid a single stalled connection. Every completed
// payload still has to match its independent full-file SHA-256 before use.
export async function downloadVerified({ name, path, size, digest, source, concurrency = 16 }) {
  assert.match(digest, /^[a-f\d]{64}$/i);
  if (existsSync(path) && statSync(path).size === size && await sha256(path) === digest) return;
  mkdirSync(resolve(path, '..'), { recursive: true });
  const part = path + '.part', journal = path + '.chunks';
  const chunkSize = 4 * 1024 * 1024, count = Math.ceil(size / chunkSize);
  const file = await open(part, existsSync(part) ? 'r+' : 'w+');
  if (statSync(part).size !== size) { await file.truncate(size); writeFileSync(journal, ''); }
  const completed = new Map();
  if (existsSync(journal)) {
    for (const line of readFileSync(journal, 'utf8').split('\n')) {
      const match = /^(\d+) ([a-f\d]{64})$/.exec(line);
      if (match && Number(match[1]) < count) completed.set(Number(match[1]), match[2]);
    }
    for (const [index, digest] of completed) {
      const hash = createHash('sha256');
      for await (const bytes of createReadStream(part, { start: index * chunkSize, end: Math.min(size, (index + 1) * chunkSize) - 1 })) hash.update(bytes);
      if (hash.digest('hex') !== digest) completed.delete(index);
    }
  }
  let cursor = 0, stopped = false, transferred = 0;
  const started = Date.now(), queue = Array.from({ length: count }, (_, index) => index).filter(index => !completed.has(index));
  const timer = setInterval(() => console.log(JSON.stringify({ phase: 'download', name, completeChunks: completed.size, totalChunks: count, bytesTransferred: transferred, seconds: Math.round((Date.now() - started) / 1000) })), 20000);
  async function worker() {
    while (!stopped && cursor < queue.length) {
      const index = queue[cursor++], start = index * chunkSize, end = Math.min(size, start + chunkSize) - 1;
      let success = false;
      for (let attempt = 0; attempt < 5 && !stopped; attempt++) {
        try {
          const url = await source.get();
          const response = await request(url, { Range: `bytes=${start}-${end}` });
          if (response.statusCode === 403) { response.resume(); source.invalidate(url); throw new Error('Expired download locator'); }
          if (response.statusCode !== 206 || response.headers['content-range'] !== `bytes ${start}-${end}/${size}`) { response.resume(); throw new Error('Server did not return the requested byte range'); }
          const rangeDeadline = setTimeout(() => response.destroy(new Error('Range transfer deadline')), 45000);
          const hash = createHash('sha256'); let offset = start;
          try {
            for await (const bytes of response) {
              assert.ok(offset + bytes.length <= end + 1);
              hash.update(bytes);
              let used = 0;
              while (used < bytes.length) { const result = await file.write(bytes, used, bytes.length - used, offset + used); used += result.bytesWritten; }
              offset += bytes.length; transferred += bytes.length;
            }
          } finally { clearTimeout(rangeDeadline); }
          assert.equal(offset, end + 1, 'Truncated range');
          const digest = hash.digest('hex');
          completed.set(index, digest); appendFileSync(journal, `${index} ${digest}\n`);
          success = true; break;
        } catch {
          if (attempt === 4) { stopped = true; throw new Error(`Download failed after retries: ${name}, chunk ${index}`); }
          await pause(500 * (attempt + 1));
        }
      }
      if (!success && !stopped) throw new Error('Download did not complete');
    }
  }
  try {
    const results = await Promise.allSettled(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
    const failure = results.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
    assert.equal(completed.size, count);
    await file.sync();
  } finally { clearInterval(timer); await file.close(); }
  assert.equal(await sha256(part), digest, `Full download SHA-256 mismatch: ${name}`);
  renameSync(part, path);
  console.log(JSON.stringify({ downloaded: name, size, sha256: digest }));
}

export async function downloadWindowsArtifacts(runId, destination) {
  const artifacts = JSON.parse(gh(['api', `repos/${repository}/actions/runs/${runId}/artifacts`])).artifacts.filter(item => /^desktop-release-(?:x86|x64)$/.test(item.name));
  assert.equal(artifacts.length, 2);
  const token = gh(['auth', 'token']);
  await Promise.all(artifacts.map(async artifact => {
    const path = join(destination, 'download-cache', `${artifact.id}.zip`);
    const digest = artifact.digest?.replace(/^sha256:/, '');
    await downloadVerified({ name: artifact.name, path, size: artifact.size_in_bytes, digest, source: locator(`https://api.github.com/repos/${repository}/actions/artifacts/${artifact.id}/zip`, { Authorization: `Bearer ${token}` }) });
    const extracted = join(destination, 'windows-download', artifact.name);
    mkdirSync(extracted, { recursive: true });
    execFileSync('ditto', ['-x', '-k', path, extracted], { stdio: 'inherit' });
    const arch = artifact.name.endsWith('x86') ? 'ia32' : 'x64';
    const report = JSON.parse(readFileSync(join(extracted, `package-win32-${arch}.json`), 'utf8'));
    for (const item of report.assets) {
      assert.equal(item.name, item.name.split(/[\\/]/).pop());
      const payload = join(extracted, item.name);
      assert.equal(statSync(payload).size, item.size); assert.equal(await sha256(payload), item.sha256);
      copyFileSync(payload, join(destination, item.name));
    }
    for (const name of [`package-win32-${arch}.json`, `windows-smoke-${arch}.json`]) copyFileSync(join(extracted, name), join(destination, name));
    console.log(JSON.stringify({ verifiedWindowsArtifact: artifact.name, sourceCommit: report.build.sourceCommit }));
  }));
}

export async function downloadPublicAssets(items, version, directory) {
  await Promise.all(items.map(item => downloadVerified({ name: item.name, path: join(directory, item.name), size: item.size, digest: item.sha256, concurrency: item.size > 16 * 1024 * 1024 ? 4 : 1, source: locator(`https://github.com/${repository}/releases/download/v${version}/${item.name}`) })));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await downloadWindowsArtifacts(process.argv[2], resolve(process.argv[3])); }
  finally { agent.destroy(); }
}
