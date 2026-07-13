'use strict';

const { app, BrowserWindow, shell, dialog, ipcMain, session } = require('electron');
const path = require('path');
const http = require('http');
const net = require('net');

let mainWindow = null;
let serverPort = 3000;

// Resolve aero-music.app to 127.0.0.1 inside Electron's network stack (bypasses YouTube domain blocks offline)
app.commandLine.appendSwitch('host-resolver-rules', 'MAP aero-music.app 127.0.0.1');

// ─────────────────────────────────────────────
// Port availability check
// ─────────────────────────────────────────────
function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port, '0.0.0.0');
  });
}

async function findFreePort(startPort) {
  for (let p = startPort; p < startPort + 20; p++) {
    if (await isPortFree(p)) return p;
  }
  throw new Error('No free port found in range ' + startPort + '-' + (startPort + 20));
}

// ─────────────────────────────────────────────
// Poll until the server is accepting connections
// ─────────────────────────────────────────────
function waitForServer(port, maxMs = 15000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + maxMs;
    function attempt() {
      const req = http.get(`http://127.0.0.1:${port}/api/catalog`, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() > deadline) {
          reject(new Error('Server did not start within ' + maxMs + 'ms'));
        } else {
          setTimeout(attempt, 200);
        }
      });
      req.end();
    }
    attempt();
  });
}

// ─────────────────────────────────────────────
// Start the bundled Express server in-process
// ─────────────────────────────────────────────
async function startBackend(port) {
  // Inject the port so server.cjs picks it up
  process.env.PORT = String(port);
  process.env.NODE_ENV = 'production';
  process.env.USER_DATA_PATH = path.join(app.getPath('appData'), 'AeroMusic');

  const serverPath = path.join(__dirname, 'dist-server', 'server.cjs');
  require(serverPath);
}

// ─────────────────────────────────────────────
// Create the Electron window
// ─────────────────────────────────────────────
function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'AeroMusic Premium Streamer',
    backgroundColor: '#0a0a0f',
    icon: path.join(__dirname, 'icon.png'),
    show: false, // show after content loads to avoid white flash
    webPreferences: {
      preload: path.join(__dirname, 'electron-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      autoplayPolicy: 'no-user-gesture-required',
    }
  });

  // Set standard desktop Chrome User Agent to bypass bot/headless detection blocks
  mainWindow.webContents.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

  mainWindow.setMenuBarVisibility(false);

  // Open external links in the default browser, not Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.loadURL(`http://aero-music.app:${port}`);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─────────────────────────────────────────────
// IPC Handlers
// ─────────────────────────────────────────────
ipcMain.handle('get-server-port', () => {
  return serverPort;
});

ipcMain.on('renderer-ready', () => {
  console.log('Renderer process is ready.');
});

ipcMain.handle('toggle-devtools', (event, open) => {
  if (mainWindow) {
    if (open) {
      mainWindow.webContents.openDevTools();
    } else {
      mainWindow.webContents.closeDevTools();
    }
  }
});

// ─────────────────────────────────────────────
// App lifecycle
// ─────────────────────────────────────────────
app.whenReady().then(async () => {
  try {
    serverPort = await findFreePort(3000);
    const fs = require('fs');
    try {
      const sharedPath = path.join(app.getPath('appData'), 'AeroMusicSharedPort.json');
      fs.writeFileSync(sharedPath, JSON.stringify({ port: serverPort }));
    } catch (e) {
      console.warn("Failed to write shared port file:", e);
    }
    await startBackend(serverPort);
    await waitForServer(serverPort);
    createWindow(serverPort);
  } catch (err) {
    dialog.showErrorBox(
      'AeroMusic — Startup Error',
      'Failed to start the AeroMusic server:\n\n' + err.message
    );
    app.quit();
  }

  app.on('activate', () => {
    // macOS: re-create window when dock icon is clicked and no windows are open
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(serverPort);
    }
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
