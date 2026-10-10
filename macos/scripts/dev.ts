import { spawn, type ChildProcess } from 'node:child_process';
import { parseArgs } from 'node:util';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, type ViteDevServer } from 'vite';
import { setTimeout as pause } from 'node:timers/promises';
import { homedir } from 'node:os';
import { request as loopbackRequest } from 'node:http';
import pkg from '../package.json';

export function developmentOptions(args: string[]) {
  const { values } = parseArgs({ args, options: { host: { type: 'string', default: '127.0.0.1' }, port: { type: 'string', default: '4173' }, strictPort: { type: 'boolean', default: true }, mode: { type: 'string', default: 'development' } } });
  if (values.host !== '127.0.0.1' || values.port !== '4173') throw new Error('本机授权开发入口固定使用 127.0.0.1:4173。');
  return { mode: values.mode, server: { host: values.host, port: 4173, strictPort: true } };
}
async function status(): Promise<boolean> {
  try {
    // Node's fetch normalizes Host; use a fixed local status request so the
    // Rust proxy boundary can retain the same Host guard as real UI requests.
    const response = await new Promise<{ status: number; body: string }>((accept, reject) => {
      const req = loopbackRequest('http://127.0.0.1:4175/api/import/status', {
        method: 'POST', headers: { Host: '127.0.0.1:4173', 'Content-Type': 'application/json', 'X-GitTogether-Client': '1' }, signal: AbortSignal.timeout(2000),
      }, res => {
        let body = ''; res.setEncoding('utf8');
        res.on('data', part => { body += part; if (body.length > 32768) res.destroy(new Error('Rust 服务状态过大。')); });
        res.once('error', reject); res.once('end', () => accept({ status: res.statusCode ?? 0, body }));
      });
      req.once('error', reject); req.end('{}');
    });
    if (response.status !== 200) throw new Error('Rust 服务状态无效。');
    let result: unknown; try { result = JSON.parse(response.body); } catch { throw new Error('Rust 服务状态无效。'); }
    if (!result || typeof result !== 'object' || !('ok' in result) || result.ok !== true || !('value' in result) || !result.value || typeof result.value !== 'object' || !('version' in result.value)) throw new Error('Rust 服务状态无效。');
    if (result.value.version !== pkg.version || !('backend' in result.value) || result.value.backend !== 'rust') throw new Error('Rust 服务身份或版本与页面不一致；未停止占用进程。');
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ECONNREFUSED') return false;
    throw error;
  }
}
async function run() {
  let server: ViteDevServer | undefined; let service: ChildProcess | undefined; let stopping = false;
  const stop = async (code = 0) => { if (stopping) return; stopping = true; process.exitCode = code; service?.kill('SIGINT'); await server?.close(); };
  process.once('SIGINT', () => void stop()); process.once('SIGTERM', () => void stop());
  try {
    if (!await status()) {
      const cargo = process.env.GITTOGETHER_CARGO || join(homedir(), '.cargo/bin/cargo');
      service = spawn(cargo, ['run', '--manifest-path', 'src-tauri/Cargo.toml', '--bin', 'gittogether-service'], { stdio: 'inherit' });
      service.once('error', () => void stop(1));
      service.once('exit', () => { if (!stopping) { process.stderr.write('Rust 服务已退出，开发环境停止。\n'); void stop(1); } });
      const deadline = Date.now() + 10 * 60_000;
      while (!stopping && !await status()) { if (Date.now() >= deadline) throw new Error('Rust 服务未及时启动。'); await pause(400); }
    }
    if (stopping) return;
    server = await createServer(developmentOptions(process.argv.slice(2)));
    await server.listen(); server.printUrls();
    process.stdout.write(`GitTogether ${pkg.version}：React 预览与 Rust 后台已就绪。\n`);
  } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : '开发服务启动失败。'}\n`); await stop(1); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await run();
