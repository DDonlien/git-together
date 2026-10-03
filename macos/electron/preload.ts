import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('gittogether', {
  environment: () => ipcRenderer.invoke('gittogether:environment'),
  setTheme: (theme: 'light' | 'dark' | 'system') => ipcRenderer.invoke('gittogether:theme', theme),
  import: (method: string, input: unknown) => ipcRenderer.invoke('gittogether:import', method, input),
  chooseDirectory: () => ipcRenderer.invoke('gittogether:choose-directory'),
});
