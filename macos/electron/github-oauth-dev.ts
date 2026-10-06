import { app, session } from 'electron';
import { join } from 'node:path';
import { createGitHubOAuthServer, previewConnector, readPreviewStatus } from '../server/github-oauth-dev-server';
import { githubOAuthSetup } from '../src/github-web-model';
import { createLoopbackFetch, fetchWithSession } from './system-network';
import { oauthConfigurationStore } from './oauth-config-store';

// The launcher supplies a unique temporary bundle directory. This helper never
// opens the desktop account store or shares its browser/cookie session.
app.setName('GitTogether Authorization');
const configurationPath = join(app.getPath('appData'), 'GitTogether Authorization', 'github-oauth-v1.encrypted');
app.setPath('userData', __dirname);
app.setPath('sessionData', __dirname);
app.whenReady().then(async () => {
  app.dock?.hide();
  const localRequest = await createLoopbackFetch();
  const remoteRequest = fetchWithSession(session.fromPartition('gittogether-oauth-remote', { cache: false }));
  const initial = await readPreviewStatus(localRequest);
  const configuration = oauthConfigurationStore(configurationPath);
  const secret = await configuration.load();
  const server = createGitHubOAuthServer({
    ...previewConnector(initial, remoteRequest, localRequest), request: remoteRequest,
    configuration: { secret, save: configuration.save },
    bind: async () => previewConnector(await readPreviewStatus(localRequest), remoteRequest, localRequest).connect,
  });
  server.on('error', () => { process.stderr.write('本机网页授权服务未能启动，请检查 4174 端口。\n'); app.exit(1); });
  server.listen(4174, '127.0.0.1', () => process.stdout.write(`本机开发授权配置：${githubOAuthSetup}\n`));
  app.on('before-quit', () => { server.closeAllConnections(); server.close(); });
  process.on('SIGINT', () => app.quit());
  process.on('SIGTERM', () => app.quit());
}).catch(() => {
  process.stderr.write('本机授权服务启动失败，请检查预览连接和系统钥匙串权限；原授权配置未修改。\n'); app.exit(1);
});
