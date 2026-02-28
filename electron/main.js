const { app, BrowserWindow, shell, Menu, Tray, nativeImage, Notification, ipcMain, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

const PRODUCTION_URL = 'https://maxbooster.replit.app';
const APP_NAME = 'Max Booster';
const APP_VERSION = (() => {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

let mainWindow;
let tray = null;
let isQuitting = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      spellcheck: true
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    title: APP_NAME,
    autoHideMenuBar: false,
    show: false,
    backgroundColor: '#1a1a2e'
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5000/dashboard');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL(PRODUCTION_URL + '/dashboard');
  }

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorDescription);
    showOfflineNotification();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      if (process.platform === 'darwin') {
        app.dock.hide();
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  createMenu();
}

function createMenu() {
  const template = [
    {
      label: APP_NAME,
      submenu: [
        { label: 'About', role: 'about' },
        { type: 'separator' },
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => mainWindow.reload() },
        { label: 'Force Reload', accelerator: 'CmdOrCtrl+Shift+R', click: () => mainWindow.webContents.reloadIgnoringCache() },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => { isQuitting = true; app.quit(); } }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Documentation',
          click: () => shell.openExternal('https://maxbooster.replit.app/docs')
        },
        {
          label: 'Support',
          click: () => shell.openExternal('https://maxbooster.replit.app/support')
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  if (!fs.existsSync(iconPath)) return;

  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.resize({ width: 16, height: 16 }));

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Max Booster', click: () => { mainWindow.show(); if (process.platform === 'darwin') app.dock.show(); } },
    { type: 'separator' },
    { label: 'Studio', click: () => { mainWindow.show(); mainWindow.webContents.executeJavaScript("window.location.href='/studio'"); } },
    { label: 'Distribution', click: () => { mainWindow.show(); mainWindow.webContents.executeJavaScript("window.location.href='/distribution'"); } },
    { label: 'Analytics', click: () => { mainWindow.show(); mainWindow.webContents.executeJavaScript("window.location.href='/analytics'"); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } }
  ]);

  tray.setToolTip(APP_NAME);
  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    mainWindow.show();
    if (process.platform === 'darwin') app.dock.show();
  });
}

function showOfflineNotification() {
  if (Notification.isSupported()) {
    new Notification({
      title: 'Connection Error',
      body: 'Unable to connect to Max Booster. Please check your internet connection.',
      icon: path.join(__dirname, 'assets', 'icon.png')
    }).show();
  }
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on('checking-for-update', () => {
    if (mainWindow) mainWindow.webContents.send('update-status', { status: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    if (Notification.isSupported()) {
      new Notification({
        title: 'Max Booster Update Available',
        body: `Version ${info.version} is downloading in the background.`,
        icon: path.join(__dirname, 'assets', 'icon.png'),
      }).show();
    }
    if (mainWindow) mainWindow.webContents.send('update-status', { status: 'available', version: info.version });
  });

  autoUpdater.on('update-not-available', () => {
    if (mainWindow) mainWindow.webContents.send('update-status', { status: 'up-to-date' });
  });

  autoUpdater.on('download-progress', (progress) => {
    if (mainWindow) {
      mainWindow.webContents.send('update-status', {
        status: 'downloading',
        percent: Math.round(progress.percent),
        transferred: progress.transferred,
        total: progress.total,
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    if (Notification.isSupported()) {
      new Notification({
        title: 'Max Booster Ready to Update',
        body: `Version ${info.version} downloaded. It will install when you quit the app.`,
        icon: path.join(__dirname, 'assets', 'icon.png'),
      }).show();
    }
    if (mainWindow) mainWindow.webContents.send('update-status', { status: 'downloaded', version: info.version });
  });

  autoUpdater.on('error', (err) => {
    const msg = err?.message || String(err);
    if (!msg.includes('net::ERR') && !msg.includes('ENOTFOUND')) {
      console.error('Auto-updater error:', msg);
    }
    if (mainWindow) mainWindow.webContents.send('update-status', { status: 'error', message: msg });
  });
}

ipcMain.handle('check-for-updates', async () => {
  try {
    return await autoUpdater.checkForUpdates();
  } catch {
    return null;
  }
});

ipcMain.handle('quit-and-install', () => {
  isQuitting = true;
  autoUpdater.quitAndInstall(false, true);
});

ipcMain.handle('get-update-status', () => {
  return {
    currentVersion: APP_VERSION,
    autoDownload: autoUpdater.autoDownload,
    autoInstallOnAppQuit: autoUpdater.autoInstallOnAppQuit,
  };
});

ipcMain.handle('show-notification', (event, { title, body }) => {
  if (Notification.isSupported()) {
    new Notification({ title, body, icon: path.join(__dirname, 'assets', 'icon.png') }).show();
  }
});

ipcMain.handle('select-audio-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Audio Files', extensions: ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg'] }
    ]
  });
  return result.filePaths;
});

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  return result.filePaths[0];
});

ipcMain.handle('read-file', async (event, filePath) => {
  try {
    return fs.readFileSync(filePath);
  } catch (error) {
    console.error('Error reading file:', error);
    return null;
  }
});

ipcMain.handle('get-file-info', async (event, filePath) => {
  try {
    const stats = fs.statSync(filePath);
    return {
      name: path.basename(filePath),
      path: filePath,
      size: stats.size,
      extension: path.extname(filePath).slice(1)
    };
  } catch (error) {
    return null;
  }
});

app.whenReady().then(() => {
  setupAutoUpdater();
  createWindow();
  createTray();

  if (process.env.NODE_ENV !== 'development') {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {});
    }, 10000);
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    mainWindow.show();
    if (process.platform === 'darwin') app.dock.show();
  }
});

app.setAboutPanelOptions({
  applicationName: APP_NAME,
  applicationVersion: APP_VERSION,
  copyright: '2024-2026 B-Lawz Music',
  credits: 'AI-Powered Music Career Management Platform\nWeb | Desktop | Mobile'
});
