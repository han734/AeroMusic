'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('adminAPI', {
  retry: () => ipcRenderer.send('retry-connection')
});
