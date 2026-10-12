import { invoke, isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open } from '@tauri-apps/plugin-dialog';
import type { UpdateStatus } from './update-model';
import type { DiagnosticsStatus } from './diagnostics-model';

// Keep the renderer's finite protocol; all business operations run in Rust.
export async function installNativeBridge(): Promise<void> {
  if (!isTauri()) return;
  window.gittogether = {
    environment: () => invoke('environment'),
    setTheme: theme => invoke('set_theme', { theme }),
    import: (method, input, requestId) => invoke('import_command', { method, input, requestId }),
    presence: (method, input) => invoke('presence_command', { method, input }),
    remoteControl: (method, input) => invoke('remote_control_command', { method, input }),
    diagnostics: {
      status: () => invoke<DiagnosticsStatus>('diagnostics_command', { method: 'status' }),
      record: input => invoke('diagnostics_command', { method: 'record', input }),
      open: () => invoke('diagnostics_command', { method: 'open' }),
      copy: () => invoke('diagnostics_command', { method: 'copy' }),
    },
    chooseDirectory: async () => {
      const selected = await open({ directory: true, multiple: false, title: '选择本地目录' });
      return typeof selected === 'string' ? selected : null;
    },
    openGithubAuthorization: () => invoke('open_github_authorization'),
    githubWeb: (method, input) => invoke('github_web', { method, input }),
    updates: {
      status: () => invoke<UpdateStatus>('update_status'),
      check: () => invoke<UpdateStatus>('update_check'),
      download: () => invoke<UpdateStatus>('update_download'),
      install: () => invoke<UpdateStatus>('update_install'),
    },
  };
  // WKWebView has a separate storage origin. Import only this application's
  // preferences, before React reads them, and never overwrite newer values.
  const key = 'gittogether.preferences.v2';
  try {
    if (!localStorage.getItem(key)) {
      const preferences = await invoke<string | null>('legacy_preferences');
      if (preferences) localStorage.setItem(key, preferences);
    }
  } catch {
    void window.gittogether.diagnostics?.record({ event: 'renderer', outcome: 'partial', method: 'preferences' });
  }
  if (document.documentElement.dataset.nativeDrag !== '1') {
    document.documentElement.dataset.nativeDrag = '1';
    document.addEventListener('mousedown', event => {
      if (event.button !== 0 || !(event.target instanceof Element)) return;
      if (!event.target.closest('.window-chrome, .repository-overview-heading, .topbar') ||
        event.target.closest('button, input, textarea, select, a, [role="button"], .repository-overview-actions, .topbar-actions')) return;
      event.preventDefault();
      void getCurrentWindow().startDragging().catch(() => {});
    });
  }
}
