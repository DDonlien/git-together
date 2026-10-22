import type { UpdateStatus } from './update-model';
import type { DiagnosticsStatus } from './diagnostics-model';

/** Only the bundled UI frame can receive this private port from Desktop. */
export async function installDesktopBridge(): Promise<void> {
  if (parent === window) return;
  const port = await new Promise<MessagePort>((resolve, reject) => {
    const timeout = setTimeout(() => { window.removeEventListener('message', connect); reject(new Error("连接超时。")); }, 15_000);
    function connect(event: MessageEvent) {
      if (event.source !== parent || event.data?.type !== 'gittogether:connect' || !event.ports[0]) return;
      clearTimeout(timeout); window.removeEventListener('message', connect); resolve(event.ports[0]);
    }
    window.addEventListener('message', connect);
    parent.postMessage({ type: 'gittogether:ready' }, '*');
  });
  const waiting = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  port.onmessage = event => {
    if (event.data?.event === 'presentation') { window.dispatchEvent(new CustomEvent('gittogether:presentation', { detail: event.data.value })); return; }
    if (event.data?.event === 'sync-progress') { window.dispatchEvent(new CustomEvent('gittogether:sync-progress', { detail: event.data.value })); return; }
    const request = waiting.get(event.data?.id); if (!request) return;
    waiting.delete(event.data.id);
    if (event.data.ok) request.resolve(event.data.value); else request.reject(new Error(event.data.error || "操作失败。"));
  };
  const call = <T = unknown>(group: string, method: string, input: unknown = {}): Promise<T> => new Promise((resolve, reject) => {
    const id = crypto.randomUUID(); waiting.set(id, { resolve: value => resolve(value as T), reject });
    port.postMessage({ id, group, method, input });
  });
  window.gittogether = {
    backend: 'github-desktop',
    presentation: (surface, input) => call<void>('presentation', surface, input),
    activateRepository: id => call<void>('select', id),
    environment: () => call('environment', 'status'),
    setTheme: theme => call('theme', theme),
    import: (method, input) => call('import', method, input),
    presence: (method, input) => call('presence', method, input),
    remoteControl: (method, input) => call('control', method, input),
    chooseDirectory: () => call('directory', 'choose'),
    openGithubAuthorization: async () => { await call('import', 'connect', { provider: 'github', host: 'https://github.com', token: '', name: '' }); },
    updates: { status: () => call<UpdateStatus>('updates', 'status'), check: () => call<UpdateStatus>('updates', 'check'), download: () => call<UpdateStatus>('updates', 'download'), install: () => call<UpdateStatus>('updates', 'install') },
    diagnostics: { status: () => call<DiagnosticsStatus>('diagnostics', 'status'), record: input => call<boolean>('diagnostics', 'record', input), open: () => call<boolean>('diagnostics', 'open') },
  };
}
