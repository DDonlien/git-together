// Preserve the stable profile before the unchanged Desktop entrypoint loads.
const { app } = require('electron');
const path = require('node:path');
if (!app.commandLine.hasSwitch('user-data-dir')) {
  const base = process.platform === 'win32' ? process.env.LOCALAPPDATA : app.getPath('appData');
  if (!base) throw new Error('无法定位应用配置目录。');
  let root = path.join(base, 'GitTogether-Standalone-Demo');
  const instance = process.argv.find(arg => arg.startsWith('--presence-instance='));
  if (instance) {
    const id = instance.slice('--presence-instance='.length);
    if (!/^[a-z0-9-]{1,64}$/.test(id)) throw new Error('实例名称无效。');
    root = path.join(root, 'instances', id);
  }
  app.setPath('userData', root);
  app.setPath('sessionData', root);
}
require('./main.js');
