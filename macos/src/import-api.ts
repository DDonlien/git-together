import { isCatalog, isRecord, type ApiInputs, type ApiMethod, type ApiOutputs } from './import-model';

export async function importAPI<M extends ApiMethod>(method: M, input: ApiInputs[M]): Promise<ApiOutputs[M]> {
  let envelope: unknown;
  if (window.gittogether) envelope = await window.gittogether.import(method, input);
  else {
    let response: Response;
    try { response = await fetch(`/api/import/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-GitTogether-Client': '1' }, body: JSON.stringify(input), signal: AbortSignal.timeout(180000) }); }
    catch { throw new Error('本地账号服务不可用，请确认预览服务仍在运行。'); }
    try { envelope = await response.json(); }
    catch { throw new Error('当前静态预览不支持本地账号服务，请使用本地运行版或桌面版。'); }
  }
  if (!isRecord(envelope) || envelope.ok !== true) throw new Error(isRecord(envelope) && typeof envelope.error === 'string' ? envelope.error : '账号服务返回格式无效。');
  const value = envelope.value;
  if (method === 'snapshot') {
    if (!isRecord(value) || typeof value.path !== 'string' || typeof value.branch !== 'string' || !Array.isArray(value.files) || !value.files.every(f => isRecord(f) && typeof f.path === 'string' && typeof f.status === 'string' && typeof f.tracked === 'boolean') || !Array.isArray(value.commits) || !value.commits.every(c => isRecord(c) && ['id', 'summary', 'author', 'time'].every(k => typeof c[k] === 'string'))) throw new Error('本地仓库返回格式无效。');
  } else if (method === 'diff') {
    if (!isRecord(value) || typeof value.text !== 'string') throw new Error('Diff 返回格式无效。');
  } else if (!isCatalog(value)) throw new Error('账号列表返回格式无效。');
  // The finite method above determines the validated result shape.
  return value as ApiOutputs[M];
}
