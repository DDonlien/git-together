import { githubVerificationURL, isCatalog, isRecord, type ApiInputs, type ApiMethod, type ApiOutputs } from './import-model';
import { isRemoteCommitDetails, isRemoteFileContent, isRemoteWorkspace } from './remote-repository-model';
import { isLocalWorkspace } from './repository-model';

export class LocalServiceError extends Error {
  constructor(readonly code: 'connection' | 'timeout' | 'unsupported' | 'server' | 'version' | 'session', message: string) { super(message); this.name = 'LocalServiceError'; }
}
export function verifyServiceVersion(version: string, expected: string): void {
  if (version !== expected) throw new LocalServiceError('version', '页面与账号服务版本不一致，请刷新页面后再连接。');
}
export async function connectAfterServiceCheck(input: ApiInputs['connect'], check: () => Promise<unknown>): Promise<ApiOutputs['connect']> {
  await check();
  return importAPI('connect', input);
}
export async function importAPI<M extends ApiMethod>(method: M, input: ApiInputs[M], signal?: AbortSignal): Promise<ApiOutputs[M]> {
  let envelope: unknown;
  if (typeof window !== 'undefined' && window.gittogether) {
    try { envelope = await window.gittogether.import(method, input); }
    catch { throw new LocalServiceError('connection', '桌面账号连接已断开，请重新打开 GitTogether。'); }
  }
  else {
    let response: Response;
    const timeout = AbortSignal.timeout(method === 'status' || method === 'catalog' ? 10000 : method.startsWith('githubAuth') ? 30000 : 180000);
    try { response = await fetch(`/api/import/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-GitTogether-Client': '1' }, body: JSON.stringify(input), signal: signal ? AbortSignal.any([signal, timeout]) : timeout }); }
    catch {
      if (signal?.aborted) throw signal.reason;
      if (timeout.aborted) throw new LocalServiceError('timeout', '本地账号服务响应超时。请重新连接检查；输入仍保留，不会自动重复提交。');
      throw new LocalServiceError('connection', '无法连接本地账号服务。请点击「重新连接」检查；输入仍保留。');
    }
    if (response.status >= 500) throw new LocalServiceError('server', `本地账号服务返回 HTTP ${response.status}，请重新连接后重试。`);
    try { envelope = await response.json(); }
    catch {
      if (signal?.aborted) throw signal.reason;
      if (timeout.aborted) throw new LocalServiceError('timeout', '本地账号服务响应超时。请重新连接检查；输入仍保留，不会自动重复提交。');
      throw new LocalServiceError('unsupported', '此页面没有可用的账号接口。请使用本地运行版或桌面版，而不是静态预览。');
    }
    if (!response.ok && isRecord(envelope) && envelope.ok === true) throw new Error('账号服务返回格式无效。');
  }
  if (!isRecord(envelope) || envelope.ok !== true) throw new Error(isRecord(envelope) && typeof envelope.error === 'string' ? envelope.error : '账号服务返回格式无效。');
  const value = envelope.value;
  if (method === 'status') {
    if (!isRecord(value) || typeof value.instanceId !== 'string' || !value.instanceId || typeof value.version !== 'string' || typeof value.githubWebAuth !== 'boolean') throw new Error('账号连接信息返回格式无效。');
  } else if (method === 'githubAuthStart') {
    if (!isRecord(value) || typeof value.id !== 'string' || !value.id || typeof value.userCode !== 'string' || !/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(value.userCode) || value.verificationURL !== githubVerificationURL || typeof value.expiresAt !== 'number' || !Number.isSafeInteger(value.expiresAt) || typeof value.interval !== 'number' || !Number.isSafeInteger(value.interval) || value.interval < 5 || value.interval > 900) throw new Error('网页授权信息返回格式无效。');
  } else if (method === 'githubAuthPoll') {
    if (!isRecord(value) || !(value.status === 'pending' && typeof value.retryAfter === 'number' && Number.isSafeInteger(value.retryAfter) && value.retryAfter >= 1 && value.retryAfter <= 3600 || value.status === 'complete' && isCatalog(value.catalog))) throw new Error('网页授权状态返回格式无效。');
  } else if (method === 'githubAuthCancel') {
    if (!isRecord(value) || !(value.cancelled === true || value.cancelled === false && isCatalog(value.catalog))) throw new Error('网页授权取消结果无效。');
  } else if (method === 'snapshot') {
    if (!isRecord(value) || typeof value.path !== 'string' || typeof value.branch !== 'string' || !Array.isArray(value.files) || !value.files.every(f => isRecord(f) && typeof f.path === 'string' && typeof f.status === 'string' && typeof f.tracked === 'boolean') || !Array.isArray(value.commits) || !value.commits.every(c => isRecord(c) && ['id', 'summary', 'author', 'time'].every(k => typeof c[k] === 'string'))) throw new Error('本地仓库返回格式无效。');
  } else if (method === 'diff') {
    if (!isRecord(value) || typeof value.text !== 'string') throw new Error('Diff 返回格式无效。');
  } else if (method === 'localWorkspace') {
    if (!isLocalWorkspace(value)) throw new Error('本地工作目录返回格式无效。');
  } else if (method === 'openFile') {
    if (!isRecord(value) || value.opened !== true) throw new Error('文件打开结果无效。');
  } else if (method === 'remoteWorkspace') {
    if (!isRemoteWorkspace(value)) throw new Error('远端工作台返回格式无效。');
  } else if (method === 'remoteCommit') {
    if (!isRemoteCommitDetails(value)) throw new Error('远端提交返回格式无效。');
  } else if (method === 'remoteFile') {
    if (!isRemoteFileContent(value)) throw new Error('远端文件返回格式无效。');
  } else if (!isCatalog(value)) throw new Error('账号列表返回格式无效。');
  // The finite method above determines the validated result shape.
  return value as ApiOutputs[M];
}
