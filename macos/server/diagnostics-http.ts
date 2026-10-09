import type { IncomingMessage, ServerResponse } from 'node:http';
import { LocalDiagnostics } from './diagnostics';
import { openSystemFile } from './system-file-open';
import { diagnosticsCommand } from './diagnostics-command';

export function diagnosticsMiddleware(log: LocalDiagnostics, open: (path: string) => Promise<void> = path => openSystemFile({ source: 'local', value: path })) {
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/api/diagnostics/')) { next(); return; }
    res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const host = req.headers.host || ''; const hostname = new URL(`http://${host}`).hostname;
      if (!['127.0.0.1', 'localhost', '[::1]'].includes(hostname) || req.headers['x-gittogether-client'] !== '1' || (req.headers.origin && req.headers.origin !== `http://${host}`) || (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin')) { res.statusCode = 403; throw new Error('仅允许本机应用的同源请求。'); }
      if (req.method !== 'POST' || !req.headers['content-type']?.startsWith('application/json')) { res.statusCode = 405; throw new Error('仅支持 JSON POST 请求。'); }
      const parts: Buffer[] = []; let size = 0;
      for await (const part of req) { size += part.length; if (size > 4096) { res.statusCode = 413; throw new Error('日志请求过大。'); } parts.push(Buffer.from(part)); }
      const input: unknown = JSON.parse(Buffer.concat(parts).toString('utf8'));
      const method = req.url.slice('/api/diagnostics/'.length);
      if (!['status', 'record', 'open'].includes(method)) { res.statusCode = 404; throw new Error('不支持该日志操作。'); }
      const value = await diagnosticsCommand(log, method, input, open);
      res.end(JSON.stringify({ ok: true, value }));
    } catch (problem) { if (res.statusCode === 200) res.statusCode = 400; res.end(JSON.stringify({ ok: false, error: problem instanceof SyntaxError ? '日志请求格式无效。' : problem instanceof Error ? problem.message : '日志操作失败。' })); }
  };
}
