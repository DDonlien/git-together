import type { IncomingMessage, ServerResponse } from 'node:http';
import { AccountService } from './account-service';

export function importMiddleware(service: AccountService) {
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const endpoint = req.url?.split('?')[0] || '';
    if (!endpoint.startsWith('/api/import/')) { next(); return; }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    const cancellation = new AbortController();
    const abort = () => cancellation.abort();
    const disconnected = () => { if (!res.writableEnded) abort(); };
    req.on('aborted', abort); res.on('close', disconnected);
    try {
      const host = req.headers.host || '';
      const hostname = new URL(`http://${host}`).hostname;
      const origin = req.headers.origin;
      if (!['127.0.0.1', 'localhost', '[::1]'].includes(hostname) ||
        req.headers['x-gittogether-client'] !== '1' ||
        (origin && origin !== `http://${host}`) ||
        (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin')) {
        res.statusCode = 403; throw new Error('仅允许本机应用的同源请求。');
      }
      if (req.method !== 'POST' || !req.headers['content-type']?.startsWith('application/json')) { res.statusCode = 405; throw new Error('仅支持 JSON POST 请求。'); }
      let size = 0; const chunks: Buffer[] = [];
      for await (const part of req) { size += part.length; if (size > 32_768) { res.statusCode = 413; throw new Error('请求过大。'); } chunks.push(Buffer.from(part)); }
      const input: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const value = await service.handle(endpoint.slice('/api/import/'.length), input, cancellation.signal);
      res.end(JSON.stringify({ ok: true, value }));
    } catch (error) {
      if (res.statusCode === 200) res.statusCode = 400;
      res.end(JSON.stringify({ ok: false, error: error instanceof SyntaxError ? '请求不是有效的 JSON。' : error instanceof Error ? error.message : '操作失败。' }));
    } finally { req.off('aborted', abort); res.off('close', disconnected); }
  };
}

export function accountImportPlugin(options: { githubClientId?: string } = {}) {
  const service = new AccountService(undefined, undefined, options);
  return {
    name: 'gittogether-account-import',
    configureServer(server: { middlewares: { use: (handler: ReturnType<typeof importMiddleware>) => void } }) { server.middlewares.use(importMiddleware(service)); },
    configurePreviewServer(server: { middlewares: { use: (handler: ReturnType<typeof importMiddleware>) => void } }) { server.middlewares.use(importMiddleware(service)); },
  };
}
