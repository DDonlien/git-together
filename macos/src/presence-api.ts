import type { PresenceConfiguration, PresenceStatus, PresenceMethod } from './presence-model';

export async function presenceCommand(method: PresenceMethod, input: PresenceConfiguration | Record<string, unknown> = {}): Promise<PresenceStatus> {
  let result: unknown;
  if (window.gittogether?.presence) result = await window.gittogether.presence(method, input);
  else {
    if (window.gittogether) throw new Error('当前版本尚未包含 Presence 插件，请更新 GitTogether。');
    // Login cleanup and legacy federated authentication may each require several network requests.
    const timeout = ['login', 'register', 'logout', 'addServer', 'selectServer'].includes(method) ? 60000 : 20000;
    const response = await fetch(`/api/presence/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-GitTogether-Client': '1' }, body: JSON.stringify(input), signal: AbortSignal.timeout(timeout) });
    result = await response.json();
  }
  const envelope = result as { ok?: boolean; value?: PresenceStatus; error?: string };
  if (envelope?.ok !== true) throw new Error(typeof envelope?.error === 'string' ? envelope.error : '无法读取 Presence 插件，请检查本机服务。');
  const value = envelope.value;
  if (!value || value.version !== 1 || typeof value.enabled !== 'boolean' || typeof value.configured !== 'boolean' || !['disabled', 'connecting', 'connected', 'offline'].includes(value.connection) || !Array.isArray(value.sessions) || !value.bridge || !Array.isArray(value.bridge.projects)) throw new Error('Presence 插件返回了无效状态。');
  return value;
}
