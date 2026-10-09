import { app } from 'electron';
import { connect } from 'node:net';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGitHubOAuthServer, previewConnector, readPreviewStatus } from '../server/github-oauth-dev-server';
import { oauthConfigurationStore } from './oauth-config-store';
import { systemFetch, createLoopbackFetch } from './system-network';
import type { LocalDiagnostics } from '../server/diagnostics';
import { diagnosticCode } from '../src/diagnostics-model';

async function occupied() {
  return new Promise<boolean>((resolve, reject) => {
    const socket = connect({ host: '127.0.0.1', port: 4174 });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', problem => { if ((problem as NodeJS.ErrnoException).code === 'ECONNREFUSED') resolve(false); else reject(problem); });
  });
}

export function nativeOAuthHelper() {
  let child: ChildProcess | undefined;
  let starting: Promise<void> | undefined;
  return {
    async ensure() {
      if (starting) return starting;
      starting = (async () => {
        if (await occupied()) return;
        const directory = await mkdtemp(join(tmpdir(), 'gittogether-native-authorization-'));
        const environment = { ...process.env }; delete environment.ELECTRON_RUN_AS_NODE;
        const flags = ['--gittogether-authorization-helper', `--gittogether-helper-session=${directory}`];
        child = spawn(process.execPath, app.isPackaged ? flags : [app.getAppPath(), ...flags], { env: environment, stdio: ['ignore', 'ignore', 'pipe'] });
        child.stderr?.on('data', () => console.warn('GitTogether 授权助手报告启动问题。'));
        child.once('exit', () => { void rm(directory, { recursive: true, force: true }).catch(() => console.warn('授权助手临时目录清理未完成。')); });
        let launchError: Error | undefined; child.once('error', problem => { launchError = problem; });
        for (let attempt = 0; attempt < 75; attempt++) {
          if (launchError || child.exitCode !== null || child.signalCode !== null) throw new Error('授权助手启动失败，请检查系统钥匙串权限。');
          if (await occupied()) return;
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        child.kill('SIGTERM'); throw new Error('GitHub 授权助手未能及时启动。');
      })();
      try { await starting; } finally { starting = undefined; }
    },
    close() { child?.kill('SIGTERM'); },
  };
}

export async function runNativeOAuthHelper(diagnostics?: LocalDiagnostics) {
  app.dock?.hide();
  const configuration = oauthConfigurationStore(join(app.getPath('appData'), 'GitTogether Authorization', 'github-oauth-v1.encrypted'));
  const secret = diagnostics ? await diagnostics.run('storage', {}, () => configuration.load()) : await configuration.load();
  const localRequest = await createLoopbackFetch();
  const bind = async () => previewConnector(await readPreviewStatus(localRequest), systemFetch, localRequest).connect;
  const server = createGitHubOAuthServer({ request: systemFetch,
    onCallback: stage => diagnostics?.record({ event: 'authorization', outcome: stage }),
    configuration: { secret, save: value => diagnostics ? diagnostics.run('storage', {}, () => configuration.save(value)) : configuration.save(value) }, bind,
    verify: async () => { await readPreviewStatus(localRequest); }, connect: async credential => (await bind())(credential),
  });
  server.on('error', problem => { diagnostics?.record({ event: 'authorization', outcome: 'failure', code: diagnosticCode(problem) }); diagnostics?.close(); console.error('网页授权服务未能启动；已保存配置未修改。'); app.exit(1); });
  server.listen(4174, '127.0.0.1');
  app.on('before-quit', () => { server.closeAllConnections(); server.close(); });
  process.on('SIGTERM', () => app.quit()); process.on('SIGINT', () => app.quit());
}
