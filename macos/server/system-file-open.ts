import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export type FileOpenTarget = { source: 'local' | 'remote'; value: string };
export type FileOpener = (target: FileOpenTarget) => Promise<void>;
const execute = promisify(execFile);

// Only AccountService supplies a validated absolute file or provider URL.
// macOS chooses the default application; no shell, application name or flags
// are accepted from the renderer.
export const openSystemFile: FileOpener = async target => {
  if (process.platform !== 'darwin') throw new Error('当前本机预览只支持 macOS 的系统文件打开。');
  try { await execute('/usr/bin/open', [target.value], { timeout: 10000, maxBuffer: 65536 }); }
  catch { throw new Error('无法用系统默认应用打开，请检查文件是否存在及是否有可用应用。'); }
};
