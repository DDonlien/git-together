import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('gittogether', {
  environment: () => ipcRenderer.invoke('gittogether:environment'),
  setTheme: (theme: 'light' | 'dark' | 'system') => ipcRenderer.invoke('gittogether:theme', theme),
});
