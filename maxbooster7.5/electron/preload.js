const { contextBridge, ipcRenderer } = require('electron');
const os = require('os');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  arch: process.arch,
  
  getVersion: () => process.versions.electron,
  getNodeVersion: () => process.versions.node,
  getChromeVersion: () => process.versions.chrome,
  
  getSystemInfo: () => ({
    platform: process.platform,
    arch: process.arch,
    cpus: os.cpus().length,
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    hostname: os.hostname(),
    username: os.userInfo().username
  }),
  
  showNotification: (title, body) => {
    return ipcRenderer.invoke('show-notification', { title, body });
  },
  
  selectAudioFiles: () => {
    return ipcRenderer.invoke('select-audio-files');
  },
  
  selectFolder: () => {
    return ipcRenderer.invoke('select-folder');
  },
  
  readFile: (filePath) => {
    return ipcRenderer.invoke('read-file', filePath);
  },
  
  getFileInfo: (filePath) => {
    return ipcRenderer.invoke('get-file-info', filePath);
  },
  
  isOnline: () => navigator.onLine,
  
  onOnlineStatusChange: (callback) => {
    window.addEventListener('online', () => callback(true));
    window.addEventListener('offline', () => callback(false));
  }
});

window.addEventListener('DOMContentLoaded', () => {
  console.log('Max Booster Desktop App loaded');
  console.log('Platform:', process.platform);
  console.log('Electron:', process.versions.electron);
});
