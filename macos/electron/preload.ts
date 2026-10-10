import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('gittogether', {
  environment: () => ipcRenderer.invoke('gittogether:environment'),
  setTheme: (theme: 'light' | 'dark' | 'system') => ipcRenderer.invoke('gittogether:theme', theme),
  import: (method: string, input: unknown, requestId?: string) => ipcRenderer.invoke('gittogether:import', method, input, requestId),
  diagnostics: {
    status: () => ipcRenderer.invoke('gittogether:diagnostics', 'status'),
    record: (input: unknown) => ipcRenderer.invoke('gittogether:diagnostics', 'record', input),
    open: () => ipcRenderer.invoke('gittogether:diagnostics', 'open'),
    copy: () => ipcRenderer.invoke('gittogether:diagnostics', 'copy'),
  },
  chooseDirectory: () => ipcRenderer.invoke('gittogether:choose-directory'),
  openGithubAuthorization: () => ipcRenderer.invoke('gittogether:github-authorization'),
  githubWeb: (method: 'start' | 'poll' | 'cancel' | 'open', input: unknown) => ipcRenderer.invoke('gittogether:github-web', method, input),
  updates: {
    status: () => ipcRenderer.invoke('gittogether:update-status'),
    check: () => ipcRenderer.invoke('gittogether:update-check'),
    download: () => ipcRenderer.invoke('gittogether:update-download'),
    install: () => ipcRenderer.invoke('gittogether:update-install'),
  },
});
