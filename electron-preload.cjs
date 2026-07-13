'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Expose a minimal, safe API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Allows the renderer to ask for the current server port if needed
  getServerPort: () => ipcRenderer.invoke('get-server-port'),
  // Signals that the renderer is ready (optional UX hook)
  rendererReady: () => ipcRenderer.send('renderer-ready'),
  // Toggles the Developer Tools visibility
  toggleDevTools: (open) => ipcRenderer.invoke('toggle-devtools', open),
});
