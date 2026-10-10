import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { validateGitHubClientSecret } from '../server/github-web-authorization';

/** One-time recovery under the old identity; no credentials in argv, env or logs. */
export function legacyOAuthMigration(options: { executable: string; entry?: string; legacyPath: string }) {
  let child: ChildProcess | undefined;
  let closed = false;
  return {
    async load(): Promise<string | null> {
      if (closed) throw new Error('旧授权配置迁移已取消；原文件未修改。');
      try { await stat(options.legacyPath); }
      catch (problem) { if ((problem as NodeJS.ErrnoException).code === 'ENOENT') return null; throw new Error('无法检查旧授权配置；原文件未修改。'); }
      const directory = await mkdtemp(join(tmpdir(), 'gittogether-authorization-migration-'));
      const chunks: Buffer[] = [];
      try {
        if (closed) throw new Error('旧授权配置迁移已取消；原文件未修改。');
        const environment = { ...process.env }; delete environment.ELECTRON_RUN_AS_NODE;
        const flags = ['--gittogether-authorization-migration', `--gittogether-helper-session=${directory}`];
        const active = spawn(options.executable, options.entry ? [options.entry, ...flags] : flags,
          { env: environment, stdio: ['ignore', 'ignore', 'ignore', 'pipe'] });
        child = active;
        const channel = active.stdio[3] as Readable | null;
        const completion = new Promise<number | null>((resolve, reject) => {
          active.once('error', reject); active.once('close', resolve); channel?.once('error', reject);
        });
        let size = 0; let tooLarge = false;
        channel?.on('data', (part: Buffer) => {
          size += part.length;
          if (size > 512) { tooLarge = true; part.fill(0); active.kill('SIGTERM'); }
          else chunks.push(part);
        });
        const code = await completion;
        if (closed || code !== 0 || tooLarge) throw new Error('旧授权配置迁移未完成，请检查系统钥匙串权限；原文件未修改。');
        if (!size) return null;
        const bytes = Buffer.concat(chunks);
        let secret: string;
        try { secret = bytes.toString('utf8'); } finally { bytes.fill(0); }
        validateGitHubClientSecret(secret);
        return secret;
      } finally {
        if (child?.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
        child = undefined;
        for (const part of chunks) part.fill(0);
        await rm(directory, { recursive: true, force: true });
      }
    },
    close() { closed = true; child?.kill('SIGTERM'); },
  };
}
