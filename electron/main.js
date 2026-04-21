'use strict';

const { app, BrowserWindow, shell, Menu, dialog, session } = require('electron');
const path = require('node:path');
const { fork } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');

const isDev = !app.isPackaged;
const SERVER_PORT = parseInt(process.env.PORT || '5174', 10);
const SERVER_HOST = '127.0.0.1';
const SERVER_URL = `http://${SERVER_HOST}:${SERVER_PORT}`;
const STARTUP_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 250;

let mainWindow = null;
let serverProcess = null;
let serverReady = false;

function resolveServerEntry() {
  const candidates = [
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'dist', 'index.mjs'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'dist', 'index.cjs'),
    path.join(process.resourcesPath || '', 'app', 'dist', 'index.mjs'),
    path.join(__dirname, '..', 'dist', 'index.mjs'),
    path.join(__dirname, '..', 'dist', 'index.cjs'),
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

function startServer() {
  const entry = resolveServerEntry();
  if (!entry) {
    console.error('[electron] Bundled server not found; falling back to static SPA');
    return null;
  }

  const env = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(SERVER_PORT),
    HOST: SERVER_HOST,
    ELECTRON_RUN_AS_NODE: '1',
    SKIP_BOOSTERSTATE: '1',
  };

  const child = fork(entry, [], {
    env,
    cwd: path.dirname(entry),
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });

  child.stdout?.on('data', (b) => process.stdout.write(`[server] ${b}`));
  child.stderr?.on('data', (b) => process.stderr.write(`[server] ${b}`));
  child.on('exit', (code, signal) => {
    console.error(`[electron] Bundled server exited code=${code} signal=${signal}`);
    serverProcess = null;
  });

  return child;
}

function pingServer() {
  return new Promise((resolve) => {
    const req = http.get(`${SERVER_URL}/`, { timeout: 1500 }, (res) => {
      res.resume();
      resolve(res.statusCode !== undefined && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function waitForServer() {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await pingServer()) return true;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return false;
}

function getStaticIndex() {
  const candidates = [
    path.join(__dirname, '..', 'dist', 'public', 'index.html'),
    path.join(process.resourcesPath || '', 'app', 'dist', 'public', 'index.html'),
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#0b0b10',
    show: false,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) {
      shell.openExternal(url).catch(() => {});
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => { mainWindow = null; });

  if (serverReady) {
    await mainWindow.loadURL(SERVER_URL);
    return;
  }

  const staticIndex = getStaticIndex();
  if (staticIndex) {
    await mainWindow.loadFile(staticIndex);
  } else {
    await mainWindow.loadURL('data:text/html,<h1 style="font-family:sans-serif;color:#fff;background:#0b0b10;padding:40px">Max Booster — bundled server not found</h1>');
  }
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: 'Open b-lawzmusic.com',
          click: () => shell.openExternal('https://b-lawzmusic.com').catch(() => {}),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    // Enforce Content-Security-Policy on all renderer responses via session headers.
    // This prevents XSS in the Electron renderer even if the server doesn't send CSP.
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const csp = [
        "default-src 'self' http://127.0.0.1:* https://*.replit.app https://*.stripe.com https://*.sentry.io",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.stripe.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' data: blob: https:",
        "connect-src 'self' http://127.0.0.1:* https:",
        "media-src 'self' blob: https:",
        "worker-src 'self' blob:",
      ].join('; ');
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [csp],
        },
      });
    });

    buildMenu();
    serverProcess = startServer();
    if (serverProcess) {
      serverReady = await waitForServer();
      if (!serverReady && !isDev) {
        dialog.showErrorBox('Max Booster', 'Failed to start the local server. The app will load the offline UI.');
      }
    }
    await createWindow();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });

  app.on('before-quit', () => {
    if (serverProcess) {
      try { serverProcess.kill(); } catch { /* noop */ }
      serverProcess = null;
    }
  });
}
