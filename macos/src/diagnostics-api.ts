import { diagnosticFailure, rendererDiagnostic, type DiagnosticInput, type DiagnosticsStatus } from './diagnostics-model';

let reportingFailure = false;
let installed = false;
async function request(method: 'status' | 'record' | 'open' | 'copy', value: unknown = {}) {
  if (window.gittogether?.diagnostics) {
    const bridge = window.gittogether.diagnostics;
    if (method === 'copy') {
      if (!bridge.copy) throw new Error('当前 App 还未包含日志复制功能，请使用更新后的版本。');
      return bridge.copy();
    }
    return method === 'record' ? bridge.record(value as DiagnosticInput) : method === 'status' ? bridge.status() : bridge.open();
  }
  if (window.gittogether) throw new Error('当前 App 还未包含日志功能，请使用更新后的版本。');
  const response = await fetch(`/api/diagnostics/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-GitTogether-Client': '1' }, body: JSON.stringify(value), signal: AbortSignal.timeout(5000) });
  const result = await response.json();
  if (!response.ok || result.ok !== true) throw new Error(typeof result.error === 'string' ? result.error : '无法连接本地日志服务。');
  return result.value;
}
export async function diagnosticsStatus(): Promise<DiagnosticsStatus> {
  const status = await request('status');
  if (!status || typeof status.directory !== 'string' || status.retentionHours !== 24 || !Number.isSafeInteger(status.maxBytes) || typeof status.limited !== 'boolean' || typeof status.error !== 'string') throw new Error('本地日志状态无效。');
  return status;
}
export const openDiagnostics = (): Promise<unknown> => request('open');
export async function copyDiagnostics(): Promise<number> {
  const count = await request('copy');
  if (!Number.isSafeInteger(count) || count < 1) throw new Error('无法确认日志文件已复制，请重试。');
  return count;
}
export function logDiagnostic(value: DiagnosticInput) {
  if (!installed || typeof window === 'undefined') return;
  const clean = rendererDiagnostic(value); if (!clean) return;
  void request('record', clean).then(() => { reportingFailure = false; }).catch(() => {
    // Never recursively log a failed logging request or print its input/error.
    if (!reportingFailure) console.warn('GitTogether 本地日志服务不可用，诊断记录可能不完整。'); reportingFailure = true;
  });
}
export function installDiagnostics() {
  if (installed) return; installed = true;
  window.addEventListener('error', event => logDiagnostic({ event: 'renderer', outcome: 'failure', ...diagnosticFailure(event.error) }));
  window.addEventListener('unhandledrejection', event => logDiagnostic({ event: 'renderer', outcome: 'failure', ...diagnosticFailure(event.reason) }));
  for (const outcome of ['online', 'offline'] as const) window.addEventListener(outcome, () => logDiagnostic({ event: 'renderer', outcome }));
  document.addEventListener('visibilitychange', () => logDiagnostic({ event: 'renderer', outcome: document.hidden ? 'hidden' : 'visible' }));
  logDiagnostic({ event: 'renderer', outcome: 'start' });
}
