import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { isRecord, isCatalog, type Catalog } from '../src/import-model';
import { githubDevClientId, githubOAuthCallback } from '../src/github-web-model';
import { GitHubWebAuthorization, type WebCredential, type WebConnector } from './github-web-authorization';

export const previewOrigin = 'http://127.0.0.1:4173';
type PreviewStatus = { instanceId: string; version: string };

async function previewRequest(method: 'status' | 'catalog' | 'connect' | 'updateAccount', input: unknown, signal?: AbortSignal, request: typeof fetch = fetch): Promise<unknown> {
  let response: Response;
  try {
    response = await request(`${previewOrigin}/api/import/${method}`, { method: 'POST', redirect: 'error',
      headers: { Origin: previewOrigin, 'Content-Type': 'application/json', 'X-GitTogether-Client': '1' }, body: JSON.stringify(input),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(180000)]) : AbortSignal.timeout(180000) });
  } catch { throw new Error('无法连接 GitTogether 账号服务，请返回应用检查连接。'); }
  let result: unknown;
  try { result = await response.json(); } catch { throw new Error('GitTogether 账号接口返回无效数据。'); }
  if (!response.ok || !isRecord(result) || result.ok !== true) {
    throw new Error('GitTogether 未能添加账号，请返回应用检查连接后重新授权。');
  }
  return result.value;
}
export async function readPreviewStatus(request: typeof fetch = fetch): Promise<PreviewStatus> {
  const value = await previewRequest('status', {}, undefined, request);
  if (!isRecord(value) || typeof value.instanceId !== 'string' || typeof value.version !== 'string') throw new Error('GitTogether 账号状态返回无效数据。');
  return { instanceId: value.instanceId, version: value.version };
}
export function previewConnector(expected: PreviewStatus, remoteRequest: typeof fetch = fetch, localRequest: typeof fetch = fetch) {
  const verify = async () => {
    const current = await readPreviewStatus(localRequest);
    if (current.instanceId !== expected.instanceId || current.version !== expected.version) throw new Error('本次授权期间账号服务已更新，请返回 GitTogether 重新开始授权。');
  };
  const connect = async (credential: WebCredential): Promise<Catalog> => {
    credential.signal.throwIfAborted(); await verify();
    let identity: unknown;
    try {
      const response = await remoteRequest('https://api.github.com/user', { redirect: 'error',
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${credential.token}`, 'User-Agent': 'GitTogether-development', 'X-GitHub-Api-Version': '2022-11-28' },
        signal: AbortSignal.any([credential.signal, AbortSignal.timeout(15000)]) });
      if (!response.ok) throw new Error();
      // This endpoint is one identity, not an unbounded repository collection.
      const reader = response.body?.getReader(); if (!reader) throw new Error();
      const chunks: Uint8Array[] = []; let size = 0;
      while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 32768) { await reader.cancel(); throw new Error(); } chunks.push(part.value); }
      identity = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch { credential.signal.throwIfAborted(); throw new Error('无法验证 GitHub 身份，请重新授权。'); }
    if (!isRecord(identity) || typeof identity.login !== 'string' || !identity.login || /[\s/]/.test(identity.login)) throw new Error('GitHub 身份返回格式无效。');
    const directory = await previewRequest('catalog', {}, credential.signal, localRequest);
    if (!isCatalog(directory)) throw new Error('GitTogether 账号列表返回无效数据。');
    if (directory.instanceId !== expected.instanceId) throw new Error('本次授权期间账号服务已更新，请返回 GitTogether 重新开始授权。');
    const existing = directory.accounts.find(account => account.provider === 'github' && account.host === 'https://github.com' && account.login.toLowerCase() === String(identity.login).toLowerCase());
    await verify(); credential.signal.throwIfAborted(); credential.commit();
    // This is server-to-server. A token never passes through the browser renderer.
    // The existing API has no cancellation gate, so after this point cancel waits
    // for the real result instead of claiming that an import was rolled back.
    const catalog = existing
      ? await previewRequest('updateAccount', { accountId: existing.id, name: credential.name || existing.name, token: credential.token }, undefined, localRequest)
      : await previewRequest('connect', { provider: 'github', host: 'https://github.com', name: credential.name, token: credential.token }, undefined, localRequest);
    if (!isCatalog(catalog)) throw new Error('GitTogether 账号列表返回无效数据。');
    return catalog;
  };
  return { verify, connect };
}

const escaped = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
function page(res: ServerResponse, title: string, content: string, script = '', streaming = false) {
  const nonce = randomBytes(24).toString('base64');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Security-Policy', `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`);
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escaped(title)}</title><style>
    :root{color-scheme:light dark;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:light-dark(#eef0f2,#24292c);color:light-dark(#222,#eee)}body{margin:0;padding:40px 24px}main{max-width:600px;margin:0 auto}h1{font-size:22px;margin:0 0 24px}section{background:light-dark(#fff,#2b3033);border-radius:16px;padding:24px}p{line-height:1.6;color:light-dark(#686970,#b0b5b8)}label{display:block;margin:20px 0 8px}input[type=password],input[type=text]{box-sizing:border-box;width:100%;font:inherit;border:1px solid light-dark(#d1d3d6,#565b60);border-radius:8px;padding:10px 12px;background:transparent;color:inherit;outline:none}input:focus{border-color:light-dark(#8c9096,#979ba1)}button,.button{border:0;border-radius:20px;padding:10px 18px;font:inherit;background:#0670e9;color:white;cursor:pointer;text-decoration:none}button:disabled{opacity:.55;cursor:default}.actions{display:flex;gap:12px;justify-content:flex-end;margin-top:24px}.check{display:flex;gap:8px;line-height:1.5}.check input{margin-top:4px}code{word-break:break-all;font-size:12px}.detail{margin:16px 0}#result{min-height:24px;color:light-dark(#b12d26,#ff8c84)}a{color:light-dark(#066bd9,#7ab6ff)}
    </style><main><h1 id="page-title">${escaped(title)}</h1>${content}</main>${script ? `<script nonce="${nonce}">${script}</script>` : ''}`;
  if (streaming) { res.write(html); res.flushHeaders(); } else res.end(`${html}</html>`);
  return nonce;
}
function finishCallback(res: ServerResponse, nonce: string, complete: boolean, message: string) {
  const title = complete ? 'GitHub 授权完成' : 'GitHub 授权未完成';
  // Script data is never interpolated as HTML, even when a connector fails.
  const safeJSON = (value: string) => JSON.stringify(value).replaceAll('<', '\\u003c');
  res.end(`<script nonce="${nonce}">document.title=${safeJSON(title)};document.getElementById('page-title').textContent=${safeJSON(title)};document.getElementById('oauth-status').textContent=${safeJSON(message)};document.documentElement.setAttribute('data-status',${safeJSON(complete ? 'complete' : 'failed')});${complete ? 'window.close();' : ''}</script></html>`);
}
async function jsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new Error('仅支持 JSON 请求。');
  const parts: Buffer[] = []; let size = 0;
  for await (const part of req) { size += part.length; if (size > 4096) throw new Error('请求过大。'); parts.push(Buffer.from(part)); }
  let value: unknown;
  try { value = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { throw new Error('请求格式无效。'); }
  if (!isRecord(value)) throw new Error('请求格式无效。');
  return value;
}
export function createGitHubOAuthServer(options: {
  connect: WebConnector; verify: () => Promise<void>;
  bind?: () => Promise<WebConnector>;
  configuration?: { secret: string | null; save(secret: string): Promise<void> };
  request?: typeof fetch; now?: () => number;
}) {
  const flow = new GitHubWebAuthorization(options.connect, options.request, options.now);
  if (options.configuration?.secret) flow.configure(options.configuration.secret);
  const setupKey = randomBytes(32).toString('base64url');
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY');
    const address = server.address(); const authority = typeof address === 'object' && address ? `127.0.0.1:${address.port}` : '';
    if (req.headers.host !== authority) { res.statusCode = 403; res.end('仅允许本机访问。'); return; }
    const origin = `http://${authority}`; const url = new URL(req.url || '/', origin);
    const applicationAPI = ['/api/status', '/api/start', '/api/poll', '/api/cancel'].includes(url.pathname);
    if (applicationAPI && req.headers.origin === previewOrigin) {
      res.setHeader('Access-Control-Allow-Origin', previewOrigin); res.setHeader('Vary', 'Origin');
      if (req.method === 'OPTIONS') {
        if (req.headers['access-control-request-method'] !== 'POST' ||
          String(req.headers['access-control-request-headers'] || '').split(',').some(header => !['content-type', 'x-gittogether-client'].includes(header.trim().toLowerCase()))) { res.statusCode = 403; res.end(); return; }
        res.setHeader('Access-Control-Allow-Methods', 'POST'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-GitTogether-Client'); res.statusCode = 204; res.end(); return;
      }
    }
    try {
      if (req.method === 'GET' && url.pathname === '/setup') {
        page(res, 'GitTogether · 开发授权配置', `<section><p>这是开发者的一次性本机配置，不是普通用户的账号登录。${options.configuration ? '应用密钥由系统安全存储加密保存，重启自动恢复，不进入源码或安装包。' : '此隔离测试配置只在当前会话有效。'}</p><div class="detail">应用：GitTogether-DDonlien-Dev<br>Client ID：<code>${githubDevClientId}</code></div><div class="detail">GitHub 应用的 Callback URL：<br><code>${githubOAuthCallback}</code></div><form id="setup"><label for="secret">新的 Client secret</label><input id="secret" type="password" required minlength="10" maxlength="512" autocomplete="off" spellcheck="false"><label class="check"><input id="rotated" type="checkbox" required><span>我已撤销发到聊天中的密钥，这里使用的是新密钥。</span></label><p id="result" role="status">${flow.configured ? '已完成本机配置。' : '尚未配置。'}</p><div class="actions"><button type="submit">保存并启用网页授权</button></div></form></section><div class="actions"><a href="${previewOrigin}/">返回 GitTogether</a></div>`, `
          const form=document.getElementById('setup'),secret=document.getElementById('secret'),result=document.getElementById('result'),button=form.querySelector('button');
          form.addEventListener('submit',async event=>{event.preventDefault();button.disabled=true;result.textContent='正在配置…';try{const response=await fetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json','X-GitTogether-Setup':${JSON.stringify(setupKey)}},body:JSON.stringify({secret:secret.value,rotated:document.getElementById('rotated').checked})});const envelope=await response.json();if(!response.ok||!envelope.ok)throw new Error(envelope.error||'配置失败。');secret.value='';result.textContent='已启用。返回 GitTogether，点击「通过 GitHub 网页授权」。';}catch(error){result.textContent=error.message||'配置失败，请重试。';}finally{button.disabled=false;}});
        `); return;
      }
      if (req.method === 'GET' && url.pathname === '/oauth/github/callback') {
        let nonce: string | undefined;
        try {
          await flow.callback(url.searchParams, () => {
            nonce = page(res, '正在完成 GitHub 授权', `<section><p id="oauth-status" role="status">正在连接 GitHub 并读取账号，请稍候…</p><a class="button" href="${previewOrigin}/">返回 GitTogether</a></section>`, "history.replaceState(null,'','/oauth/github/callback');", true);
          });
          finishCallback(res, nonce!, true, '账号已添加到 GitTogether。你可以关闭这个窗口。');
        } catch (problem) {
          const message = problem instanceof Error ? problem.message : '请返回 GitTogether 重新开始。';
          if (nonce) finishCallback(res, nonce, false, message);
          else {
            res.statusCode = 400;
            page(res, 'GitHub 授权未完成', `<section><p>${escaped(message)}</p><a href="${previewOrigin}/">返回 GitTogether</a></section>`, "history.replaceState(null,'','/oauth/github/callback');");
          }
        }
        return;
      }
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (req.method !== 'POST') { res.statusCode = 405; throw new Error('仅支持 POST 请求。'); }
      if (applicationAPI) {
        if (req.headers.origin !== previewOrigin || req.headers['x-gittogether-client'] !== '1') { res.statusCode = 403; throw new Error('仅允许 GitTogether 预览发起授权。'); }
      } else if (url.pathname === '/api/config') {
        if (req.headers.origin !== origin || req.headers['x-gittogether-setup'] !== setupKey || (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin')) { res.statusCode = 403; throw new Error('请从本机开发配置页输入。'); }
      } else { res.statusCode = 404; throw new Error('接口不存在。'); }
      const input = await jsonBody(req); let value: unknown;
      if (url.pathname === '/api/config') {
        if (input.rotated !== true || typeof input.secret !== 'string') throw new Error('请先撤销已暴露的密钥，再直接输入新密钥。');
        const secret = input.secret.trim();
        if (options.configuration) await flow.configureAndSave(secret, next => options.configuration!.save(next));
        else flow.configure(secret);
        value = { configured: true };
      } else if (url.pathname === '/api/status') value = { configured: flow.configured };
      else if (url.pathname === '/api/start') {
        // Each new login captures its own main-service instance; old callbacks
        // retain their original connector instead of following a mutable binding.
        const connect = options.bind ? await options.bind() : (await options.verify(), options.connect);
        value = flow.start(typeof input.name === 'string' ? input.name : '', connect);
      }
      else {
        if (typeof input.sessionId !== 'string' || !/^[\w-]{36}$/.test(input.sessionId)) throw new Error('授权会话格式无效。');
        value = url.pathname === '/api/poll' ? flow.poll(input.sessionId) : await flow.cancel(input.sessionId);
      }
      res.end(JSON.stringify({ ok: true, value }));
    } catch (problem) {
      if (res.statusCode === 200) res.statusCode = 400;
      res.end(JSON.stringify({ ok: false, error: problem instanceof Error ? problem.message : '操作失败。' }));
    }
  });
  return server;
}
