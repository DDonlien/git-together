// Isolated provider transport backed by real temporary Git. Only tests import
// this module; synthetic credentials never reach GitHub/Gitea or production.
import { AccountService, sessionStore } from '../server/account-service';
import { isCatalog, type Provider } from '../src/import-model';
import { createGitRemoteFixture } from './git-remote-fixture';
import type { FileOpener } from '../server/system-file-open';
import type { LocalDiagnostics } from '../server/diagnostics';

export async function createRemoteServiceFixture(provider: Provider, options: { openFile?: FileOpener; treeChanges?: boolean; diagnostics?: LocalDiagnostics } = {}) {
  const git = await createGitRemoteFixture(provider, { treeChanges: options.treeChanges });
  const requests: { url: URL; authorization: string; signal?: AbortSignal | null }[] = [];
  let failure = 0;
  let failWhere: (url: URL) => boolean = () => true;
  let hold: (() => Promise<void>) | undefined;
  const request: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    requests.push({ url, authorization: new Headers(init?.headers).get('Authorization') || '', signal: init?.signal });
    if (url.pathname.endsWith('/user')) return Response.json({ login: 'qa', name: '隔离测试账号' });
    if (url.pathname.endsWith('/user/repos')) return Response.json(url.searchParams.get('page') === '1' ? [{ id: 1, name: 'project', full_name: 'qa/project', default_branch: 'main', private: false, description: '隔离 Git 测试' }] : []);
    if (hold) { const pending = hold; hold = undefined; await pending(); }
    init?.signal?.throwIfAborted();
    if (failure && failWhere(url)) return new Response('provider diagnostic and credentials must not leak', { status: failure });
    const path = url.pathname.replace(/^\/api\/v1/, '') + url.search;
    const format = new Headers(init?.headers).get('Accept') === 'text/plain' ? 'text' : 'json';
    const result = await git.transport(path, format, init?.signal || undefined);
    return format === 'text' ? new Response(String(result.value), { headers: result.headers }) : Response.json(result.value, { headers: result.headers });
  };
  const service = new AccountService(sessionStore(), request, options);
  const catalog = await service.handle('connect', { provider, host: 'https://git.fixture.test', token: 'fixture-remote-old', name: '隔离测试账号' });
  if (!isCatalog(catalog)) throw new Error('Invalid fixture catalog');
  return { ...git, service, repositoryId: catalog.repositories[0].id, accountId: catalog.accounts[0].id, requests,
    fail: (status: number, where: (url: URL) => boolean = () => true) => { failure = status; failWhere = where; }, holdNext: (wait: () => Promise<void>) => { hold = wait; } };
}
