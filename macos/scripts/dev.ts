import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as pause } from 'node:timers/promises';
import { createServer, type ViteDevServer } from 'vite';
import { isRecord } from '../src/import-model';
import { githubDevClientId, githubOAuthOrigin } from '../src/github-web-model';
import { previewOrigin, readPreviewStatus } from '../server/github-oauth-dev-server';
import pkg from '../package.json';

type HelperStatus = { configured: boolean; version: string; clientId: string };

// The registered local callback and connector have fixed origins. Never silently
// fall through to Vite's next port or expose a credential service on the LAN.
export function developmentOptions(args: string[]) {
  const { values } = parseArgs({ args, options: { host: { type: 'string', default: '127.0.0.1' }, port: { type: 'string', default: '4173' }, strictPort: { type: 'boolean', default: true }, mode: { type: 'string', default: 'development' } } });
  if (values.host !== '127.0.0.1' || values.port !== '4173') throw new Error('本机授权开发入口固定使用 127.0.0.1:4173；不能改为其他地址或端口。');
  return { mode: values.mode, server: { host: values.host, port: 4173, strictPort: true } };
}

export async function readAuthorizationStatus(request: typeof fetch = fetch): Promise<HelperStatus | null> {
  let response: Response;
  try {
    response = await request(`${githubOAuthOrigin}/api/status`, { method: 'POST', redirect: 'error', credentials: 'omit',
      headers: { Origin: previewOrigin, 'Content-Type': 'application/json', 'X-GitTogether-Client': '1' }, body: '{}', signal: AbortSignal.timeout(2000) });
  } catch (error) {
    if (error instanceof Error && isRecord(error.cause) && error.cause.code === 'ECONNREFUSED') return null;
    throw new Error('本机授权服务状态检查失败或超时；未停止其他进程。');
  }
  let body: unknown;
  try { body = await response.json(); } catch { throw new Error('4174 不是有效的 GitTogether 授权服务；未停止占用进程。'); }
  if (!response.ok || !isRecord(body) || body.ok !== true || !isRecord(body.value) || typeof body.value.configured !== 'boolean' || typeof body.value.version !== 'string' || typeof body.value.clientId !== 'string') {
    throw new Error('4174 授权服务状态无效或版本过旧；请恢复本项目服务，不能覆盖未知进程。');
  }
  if (body.value.version !== pkg.version || body.value.clientId !== githubDevClientId) throw new Error('授权助手版本或应用身份不匹配；未停止占用进程。');
  return { configured: body.value.configured, version: body.value.version, clientId: body.value.clientId };
}

// Reuse an already healthy helper without taking ownership of it. Only a helper
// spawned by this entry is stopped on startup failure or when this entry exits.
export async function ensureAuthorizationHelper(start: () => ChildProcess, options: { request?: typeof fetch; wait?: () => Promise<unknown> } = {}): Promise<{ child: ChildProcess | null; status: HelperStatus }> {
  const request = options.request || fetch;
  const existing = await readAuthorizationStatus(request);
  if (existing) return { child: null, status: existing };
  const child = start(); let failed = false;
  child.once('error', () => { failed = true; });
  try {
    // 75 x 200ms permits a cold Electron launch, not an endless restart loop.
    for (let attempt = 0; attempt < 75; attempt++) {
      if (failed || child.exitCode !== null || child.signalCode !== null) throw new Error('本机授权助手启动失败；请检查系统加密或端口占用。');
      const status = await readAuthorizationStatus(request);
      if (status) return { child, status };
      await (options.wait ? options.wait() : pause(200));
    }
    throw new Error('本机授权助手未及时就绪；未输出或重新提交应用密钥。');
  } catch (error) { child.kill('SIGTERM'); throw error; }
}

async function run() {
  let server: ViteDevServer | undefined; let helper: ChildProcess | null = null; let stopping = false;
  async function stop(code = 0) {
    if (stopping) return;
    stopping = true; process.exitCode = code;
    const exited = helper && helper.exitCode === null && helper.signalCode === null ? new Promise<void>(done => helper!.once('close', () => done())) : Promise.resolve();
    if (helper && !helper.killed) helper.kill('SIGTERM');
    await Promise.all([server?.close(), exited]);
  }
  const interrupt = () => { void stop(); };
  process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
  try {
    server = await createServer(developmentOptions(process.argv.slice(2)));
    if (stopping) { await server.close(); return; }
    await server.listen();
    if (stopping) return;
    const preview = await readPreviewStatus();
    if (preview.version !== pkg.version) throw new Error('账号服务版本不匹配，开发环境未就绪。');
    if (stopping) return;
    const require = createRequire(import.meta.url);
    const ready = await ensureAuthorizationHelper(() => {
      helper = spawn(process.execPath, [require.resolve('tsx/cli'), fileURLToPath(new URL('../server/github-oauth-dev.ts', import.meta.url))], { stdio: 'inherit' });
      return helper;
    });
    helper = ready.child;
    if (stopping) return;
    helper?.once('exit', () => { if (!stopping) { process.stderr.write('授权助手已退出，开发环境不再就绪。\n'); void stop(1); } });
    server.printUrls();
    if (ready.status.configured) process.stdout.write(`GitTogether ${pkg.version} 测试就绪：预览、账号服务和 GitHub 网页授权；已恢复加密应用配置。\n`);
    else process.stderr.write('预览和授权服务已启动，但开发者首次应用配置缺失；不表示账号登录已就绪。请在 http://127.0.0.1:4174/setup 安全配置一次。\n');
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : '开发环境启动失败。'}\n`);
    await stop(1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await run();
