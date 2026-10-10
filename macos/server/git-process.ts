import { spawn } from 'node:child_process';

// Wait for the process group to exit before reporting cancellation or releasing
// an index lock. Hooks and signing helpers must not continue after a timeout.
export async function runGitProcess(root: string, args: string[], options: { env?: NodeJS.ProcessEnv; stdin?: string; signal?: AbortSignal; timeoutMs?: number } = {}): Promise<string> {
  options.signal?.throwIfAborted();
  const env: NodeJS.ProcessEnv = { ...process.env, LC_ALL: 'C', GIT_TERMINAL_PROMPT: '0', GIT_NO_LAZY_FETCH: '1', GIT_OPTIONAL_LOCKS: '0' };
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES']) delete env[key];
  Object.assign(env, options.env);
  return new Promise((accept, reject) => {
    const child = spawn('git', ['-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false', '-c', 'core.pager=cat', '-C', root, ...args], { env, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
    const output: Buffer[] = [], errors: Buffer[] = [];
    let bytes = 0, errorBytes = 0, failure: Error | undefined, force: ReturnType<typeof setTimeout> | undefined;
    const kill = (signal: NodeJS.Signals) => { if (child.pid) { try { process.platform === 'win32' ? child.kill(signal) : process.kill(-child.pid, signal); } catch { child.kill(signal); } } };
    const stop = () => { kill('SIGTERM'); force ??= setTimeout(() => kill('SIGKILL'), 1500); };
    const abort = () => { failure = new Error('操作已取消。'); stop(); };
    options.signal?.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(() => { failure = new Error('Git 操作超时；请检查提交历史后重试。'); stop(); }, options.timeoutMs ?? 120_000);
    child.stdout.on('data', (data: Buffer) => { bytes += data.length; if (bytes <= 8_000_000) output.push(data); else { failure = new Error('Git 输出超过可读取范围。'); stop(); } });
    child.stderr.on('data', (data: Buffer) => { errorBytes += data.length; if (errorBytes <= 1_000_000) errors.push(data); });
    child.on('error', problem => { failure = problem; });
    child.stdin.on('error', () => { /* Git may reject input before consuming it. Its exit status is authoritative. */ });
    child.on('close', code => {
      clearTimeout(timeout); if (force) clearTimeout(force); options.signal?.removeEventListener('abort', abort);
      if (failure) reject(failure);
      else if (code !== 0) reject(Object.assign(new Error('Git 操作失败。'), { code, stdout: Buffer.concat(output).toString('utf8'), stderr: Buffer.concat(errors).toString('utf8') }));
      else accept(Buffer.concat(output).toString('utf8'));
    });
    child.stdin.end(options.stdin);
    if (options.signal?.aborted) abort();
  });
}
