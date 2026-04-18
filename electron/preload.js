'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('maxBoosterDesktop', {
  platform: process.platform,
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node,
  },
  send: (channel, payload) => {
    const allowed = new Set(['app:minimize', 'app:maximize', 'app:close']);
    if (allowed.has(channel)) ipcRenderer.send(channel, payload);
  },
});
