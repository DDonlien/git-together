import { diagnosticFailure, rendererDiagnostic, type DiagnosticInput, type DiagnosticsStatus } from './diagnostics-model';
import { installPerformanceDiagnostics } from './performance-diagnostics';

let reportingFailure = false;
let installed = false;
let stopDiagnostics: (() => void) | undefined;
const pending: DiagnosticInput[] = [];
let sending = false, dropped = 0;
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
  if (pending.length >= 128) { dropped++; return; }
  pending.push(clean);
  if (!sending) void drain();
}
async function drain() {
  sending = true;
  let reportingLoss = 0;
  try {
    while (pending.length) {
      reportingLoss = dropped; dropped = 0;
      if (reportingLoss) await request('record', { event: 'performance', phase: 'renderer-log-queue', outcome: 'partial', dropped: reportingLoss });
      reportingLoss = 0;
      await request('record', pending.shift()!); reportingFailure = false;
    }
  } catch {
    // Never recursively log the logger or print inputs/errors. Bounded memory
    // and one in-flight request keep a slow disk/bridge out of the GUI path.
    dropped += pending.length + 1 + reportingLoss; pending.length = 0;
    if (!reportingFailure) console.warn('GitTogether 本地日志服务不可用，诊断记录可能不完整。'); reportingFailure = true;
  } finally { sending = false; }
}
export function installDiagnostics() {
  if (installed) return; installed = true;
  const error = (event: ErrorEvent) => logDiagnostic({ event: 'renderer', outcome: 'failure', ...diagnosticFailure(event.error) });
  const rejection = (event: PromiseRejectionEvent) => logDiagnostic({ event: 'renderer', outcome: 'failure', ...diagnosticFailure(event.reason) });
  const online = () => logDiagnostic({ event: 'renderer', outcome: 'online' });
  const offline = () => logDiagnostic({ event: 'renderer', outcome: 'offline' });
  const visibility = () => logDiagnostic({ event: 'renderer', outcome: document.hidden ? 'hidden' : 'visible' });
  window.addEventListener('error', error); window.addEventListener('unhandledrejection', rejection);
  window.addEventListener('online', online); window.addEventListener('offline', offline);
  document.addEventListener('visibilitychange', visibility);
  logDiagnostic({ event: 'renderer', outcome: 'start' });
  const stopPerformance = installPerformanceDiagnostics(logDiagnostic);
  const stop = () => {
    if (!installed) return;
    stopPerformance(); installed = false;
    window.removeEventListener('error', error); window.removeEventListener('unhandledrejection', rejection);
    window.removeEventListener('online', online); window.removeEventListener('offline', offline);
    document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', stop);
  };
  stopDiagnostics = stop;
  window.addEventListener('pagehide', stop, { once: true });
}
if (import.meta.hot) import.meta.hot.dispose(() => stopDiagnostics?.());
