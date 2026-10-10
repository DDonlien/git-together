import { connect } from 'node:net';
import type { Server } from 'node:http';
import { createGitHubOAuthServer, previewConnector, readPreviewStatus } from '../server/github-oauth-dev-server';
import type { oauthConfigurationStore } from './oauth-config-store';
import type { LocalDiagnostics } from '../server/diagnostics';
import { diagnosticCode } from '../src/diagnostics-model';

async function occupied(port: number) {
  return new Promise<boolean>((resolve, reject) => {
    const socket = connect({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', problem => { if ((problem as NodeJS.ErrnoException).code === 'ECONNREFUSED') resolve(false); else reject(problem); });
  });
}

type Configuration = { secret: string | null; save(secret: string): Promise<void> };

/** Native callbacks share the main app's already-authorized encryption identity. */
export function nativeOAuthHelper(options: {
  configuration: ReturnType<typeof oauthConfigurationStore>;
  restoreLegacy: () => Promise<string | null>;
  request: typeof fetch; localRequest: typeof fetch;
  diagnostics?: LocalDiagnostics; port?: number;
}) {
  const port = options.port ?? 4174;
  let server: Server | undefined;
  let starting: Promise<void> | undefined;
  let prepared: Promise<Configuration> | undefined;
  let closed = false;
  const storage = <T>(operation: () => Promise<T>) => options.diagnostics ? options.diagnostics.run('storage', {}, operation) : operation();
  const prepare = () => {
    if (!prepared) prepared = (async () => {
      let secret = await storage(() => options.configuration.load());
      if (secret === null) {
        const restored = await options.restoreLegacy();
        if (restored !== null) await storage(() => options.configuration.save(restored));
        secret = restored;
      }
      const configuration: Configuration = {
        secret,
        async save(value) {
          await storage(() => options.configuration.save(value));
          configuration.secret = value;
        },
      };
      return configuration;
    })();
    return prepared;
  };
  return {
    // Prepare at app startup, so opening a login never performs a keychain read.
    prepare,
    async ensure() {
      if (closed) throw new Error('GitTogether 正在退出，请重新打开后授权。');
      if (starting) return starting;
      starting = (async () => {
        if (server?.listening || await occupied(port)) return;
        const configuration = await prepare();
        if (closed) throw new Error('GitTogether 正在退出，请重新打开后授权。');
        const bind = async () => previewConnector(await readPreviewStatus(options.localRequest), options.request, options.localRequest).connect;
        const active = createGitHubOAuthServer({ request: options.request, configuration, bind,
          onCallback: stage => options.diagnostics?.record({ event: 'authorization', outcome: stage }),
          verify: async () => { await readPreviewStatus(options.localRequest); }, connect: async credential => (await bind())(credential),
        });
        server = active;
        active.on('error', problem => {
          options.diagnostics?.record({ event: 'authorization', outcome: 'failure', code: diagnosticCode(problem) });
          if (server === active) server = undefined;
          active.closeAllConnections();
          if (active.listening) active.close();
        });
        await new Promise<void>((resolve, reject) => {
          active.once('error', reject);
          active.listen(port, '127.0.0.1', () => { active.off('error', reject); resolve(); });
        });
      })();
      try { await starting; } finally { starting = undefined; }
    },
    close() { closed = true; server?.closeAllConnections(); server?.close(); server = undefined; },
  };
}
