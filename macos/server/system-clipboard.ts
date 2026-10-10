import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
// NSURL pasteboard items preserve file attachments, including multiple files.
// Arguments are fixed-directory logger paths, never renderer-supplied script.
const copyFilesScript = `
ObjC.import('AppKit');
function run(paths) {
  const files = paths.map(path => $.NSURL.fileURLWithPath(path));
  const pasteboard = $.NSPasteboard.generalPasteboard;
  pasteboard.clearContents;
  if (!pasteboard.writeObjects($(files))) throw new Error('Clipboard write failed');
}
`;

export async function copySystemFiles(files: string[]): Promise<void> {
  if (process.platform !== 'darwin') throw new Error('当前系统不支持复制日志文件。');
  if (!files.length) throw new Error('暂无可复制的日志文件。');
  try { await execute('/usr/bin/osascript', ['-l', 'JavaScript', '-e', copyFilesScript, ...files], { timeout: 4000, maxBuffer: 65536 }); }
  catch { throw new Error('无法将日志文件复制到剪贴板，请重试。'); }
}
