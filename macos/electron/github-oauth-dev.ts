import { app, session } from 'electron';
import { join } from 'node:path';
import { createGitHubOAuthServer, previewConnector, readPreviewStatus } from '../server/github-oauth-dev-server';
import { githubOAuthSetup } from '../src/github-web-model';
import { createLoopbackFetch, fetchWithSession } from './system-network';
import { oauthConfigurationStore } from './oauth-config-store';
import { LocalDiagnostics } from '../server/diagnostics';
import { diagnosticCode } from '../src/diagnostics-model';

// The launcher supplies a unique temporary bundle directory. This helper never
// opens the desktop account store or shares its browser/cookie session.
app.setName('GitTogether Authorization');
const configurationPath = join(app.getPath('appData'), 'GitTogether Authorization', 'github-oauth-v1.encrypted');
app.setPath('userData', __dirname);
app.setPath('sessionData', __dirname);
const diagnostics = new LocalDiagnostics(join(app.getPath('appData'), 'GitTogether-Standalone-Demo', 'logs'), 'authorization');
diagnostics.record({ event: 'lifecycle', outcome: 'start' });
process.on('uncaughtExceptionMonitor', problem => diagnostics.record({ event: 'lifecycle', outcome: 'failure', code: diagnosticCode(problem) }));
app.on('before-quit', () => { diagnostics.record({ event: 'lifecycle', outcome: 'complete' }); diagnostics.close(); });
app.whenReady().then(async () => {
  app.dock?.hide();
  const localRequest = await createLoopbackFetch();
  const remoteRequest = fetchWithSession(session.fromPartition('gittogether-oauth-remote', { cache: false }));
  const initial = await readPreviewStatus(localRequest);
  const configuration = oauthConfigurationStore(configurationPath);
  const secret = await diagnostics.run('storage', {}, () => configuration.load());
  const server = createGitHubOAuthServer({
    onCallback: stage => { diagnostics.record({ event: 'authorization', outcome: stage }); process.stdout.write(`GitHub callback: ${stage}\n`); },
    ...previewConnector(initial, remoteRequest, localRequest), request: remoteRequest,
    configuration: { secret, save: value => diagnostics.run('storage', {}, () => configuration.save(value)) },
    bind: async () => previewConnector(await readPreviewStatus(localRequest), remoteRequest, localRequest).connect,
  });
  server.on('error', problem => { diagnostics.record({ event: 'authorization', outcome: 'failure', code: diagnosticCode(problem) }); diagnostics.close(); process.stderr.write('本机网页授权服务未能启动，请检查 4174 端口。\n'); app.exit(1); });
  server.listen(4174, '127.0.0.1', () => process.stdout.write(`本机开发授权配置：${githubOAuthSetup}\n`));
  app.on('before-quit', () => { server.closeAllConnections(); server.close(); });
  process.on('SIGINT', () => app.quit());
  process.on('SIGTERM', () => app.quit());
}).catch(problem => {
  diagnostics.record({ event: 'lifecycle', outcome: 'failure', code: diagnosticCode(problem) }); diagnostics.close();
  process.stderr.write('本机授权服务启动失败，请检查预览连接和系统钥匙串权限；原授权配置未修改。\n'); app.exit(1);
});
