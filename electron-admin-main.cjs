'use strict';

const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const http = require('http');

let mainWindow = null;
let serverPort = 3000;
let isServerStarted = false;

// Allow self-signed certificate loading if user tries to connect via custom HTTPS server
app.commandLine.appendSwitch('ignore-certificate-errors');

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
      const req = http.get(`http://127.0.0.1:${port}/admin.html`, (res) => {
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
  if (isServerStarted) return;
  
  process.env.PORT = String(port);
  process.env.NODE_ENV = 'production';
  // Use the standardized shared database directory
  process.env.USER_DATA_PATH = path.join(app.getPath('appData'), 'AeroMusic');

  const serverPath = path.join(__dirname, 'dist-server', 'server.cjs');
  require(serverPath);
  isServerStarted = true;
  console.log(`Backend server started in-process on port ${port}.`);
}

// ─────────────────────────────────────────────
// Create BrowserWindow
// ─────────────────────────────────────────────
async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 800,
    minHeight: 550,
    title: 'AeroMusic Admin Console',
    backgroundColor: '#07070a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'electron-admin-preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  mainWindow.setMenuBarVisibility(false);

  // Open links in default external browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Try to find if a server is already running on the last shared port
  let port = 3000;
  let serverRunning = false;
  const sharedPath = path.join(app.getPath('appData'), 'AeroMusicSharedPort.json');
  
  try {
    if (fs.existsSync(sharedPath)) {
      const info = JSON.parse(fs.readFileSync(sharedPath, 'utf8'));
      if (info && info.port) {
        port = info.port;
        const free = await isPortFree(port);
        if (!free) {
          serverRunning = true;
        }
      }
    }
  } catch (e) {
    console.warn("Could not read shared port file, will check default port 3000:", e);
  }

  // If no server running, start it in-process
  if (!serverRunning) {
    console.log("No active database server detected. Starting server in-process...");
    try {
      port = await findFreePort(3000);
      await startBackend(port);
      await waitForServer(port);
      
      // Save port to shared file so both apps can share it
      try {
        fs.writeFileSync(sharedPath, JSON.stringify({ port }));
      } catch (e) {
        console.warn("Failed to write shared port file:", e);
      }
    } catch (err) {
      console.error("Failed to start backend server inside admin process:", err);
    }
  } else {
    console.log(`Discovered active server running on port ${port}. Connecting...`);
  }

  serverPort = port;

  // Load the admin portal page
  mainWindow.loadURL(`http://localhost:${port}/admin.html`);

  // Trigger fallback screen if connection fails
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    if (validatedURL.includes('/admin.html')) {
      console.warn("Failed to connect to local server, loading connection fallback screen...");
      mainWindow.loadFile(path.join(__dirname, 'admin-fallback.html'));
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─────────────────────────────────────────────
// IPC Handlers
// ─────────────────────────────────────────────
ipcMain.on('retry-connection', async () => {
  if (!mainWindow) return;
  
  let port = serverPort;
  let serverRunning = false;
  const sharedPath = path.join(app.getPath('appData'), 'AeroMusicSharedPort.json');
  
  try {
    if (fs.existsSync(sharedPath)) {
      const info = JSON.parse(fs.readFileSync(sharedPath, 'utf8'));
      if (info && info.port) {
        port = info.port;
        const free = await isPortFree(port);
        if (!free) {
          serverRunning = true;
        }
      }
    }
  } catch (e) {}

  if (!serverRunning) {
    console.log("Retry: starting backend server in-process...");
    try {
      port = await findFreePort(3000);
      await startBackend(port);
      await waitForServer(port);
      try {
        fs.writeFileSync(sharedPath, JSON.stringify({ port }));
      } catch (e) {}
    } catch (err) {
      console.error("Retry: failed to start server:", err);
    }
  }

  serverPort = port;
  mainWindow.loadURL(`http://localhost:${port}/admin.html`);
});

// ─────────────────────────────────────────────
// App Lifecycle
// ─────────────────────────────────────────────
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
