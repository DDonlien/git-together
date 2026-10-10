import { rendererDiagnostic } from '../src/diagnostics-model';
import type { LocalDiagnostics } from './diagnostics';
import { copySystemFiles } from './system-clipboard';

// Both transport guards run before this finite command. No command accepts a path.
export async function diagnosticsCommand(log: LocalDiagnostics, method: unknown, input: unknown, open: (directory: string) => Promise<void>, copy: (files: string[]) => Promise<void> = copySystemFiles) {
  if (method === 'status') return log.status();
  if (method === 'record') { const clean = rendererDiagnostic(input); if (!clean) throw new Error('日志事件无效。'); log.record(clean); return true; }
  if (method === 'open') {
    const status = log.status(); if (status.error) throw new Error(status.error);
    try { await open(log.directory); } catch { throw new Error('无法打开本地日志目录。'); }
    return true;
  }
  if (method === 'copy') {
    const files = log.files();
    if (!files.length) throw new Error('暂无可复制的日志文件。');
    await copy(files);
    return files.length;
  }
  throw new Error('不支持该日志操作。');
}
