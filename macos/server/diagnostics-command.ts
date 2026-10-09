import { rendererDiagnostic } from '../src/diagnostics-model';
import type { LocalDiagnostics } from './diagnostics';

// Both transport guards run before this finite command. No command accepts a path.
export async function diagnosticsCommand(log: LocalDiagnostics, method: unknown, input: unknown, open: (directory: string) => Promise<void>) {
  if (method === 'status') return log.status();
  if (method === 'record') { const clean = rendererDiagnostic(input); if (!clean) throw new Error('日志事件无效。'); log.record(clean); return true; }
  if (method === 'open') {
    const status = log.status(); if (status.error) throw new Error(status.error);
    try { await open(log.directory); } catch { throw new Error('无法打开本地日志目录。'); }
    return true;
  }
  throw new Error('不支持该日志操作。');
}
