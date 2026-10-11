import type { PresenceConfiguration, PresenceStatus } from './presence-model';

export async function presenceCommand(method: 'status' | 'configure' | 'reconnect', input: PresenceConfiguration | Record<string, never> = {}): Promise<PresenceStatus> {
  let result: unknown;
  if (window.gittogether?.presence) result = await window.gittogether.presence(method, input);
  else {
    if (window.gittogether) throw new Error('当前版本尚未包含 Presence 插件，请更新 GitTogether。');
    const response = await fetch(`/api/presence/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-GitTogether-Client': '1' }, body: JSON.stringify(input), signal: AbortSignal.timeout(5000) });
    result = await response.json();
  }
  const envelope = result as { ok?: boolean; value?: PresenceStatus; error?: string };
  if (envelope?.ok !== true) throw new Error(typeof envelope?.error === 'string' ? envelope.error : '无法读取 Presence 插件，请检查本机服务。');
  const value = envelope.value;
  if (!value || value.version !== 1 || typeof value.enabled !== 'boolean' || typeof value.configured !== 'boolean' || !['disabled', 'connecting', 'connected', 'offline'].includes(value.connection) || !Array.isArray(value.sessions) || !value.bridge || !Array.isArray(value.bridge.projects)) throw new Error('Presence 插件返回了无效状态。');
  return value;
}
