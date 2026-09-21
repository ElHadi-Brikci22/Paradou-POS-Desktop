const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('posDesktop', {
  // 1. Silent ESC/POS Printing
  getPrinters: () => ipcRenderer.invoke('pos:get-printers'),
  silentPrint: (htmlContent, printerName) => ipcRenderer.invoke('pos:silent-print', { htmlContent, printerName }),

  // 2. Network watchdog & cloud health check
  pingCloud: (serverUrl) => ipcRenderer.invoke('pos:ping-cloud', serverUrl),

  // 3. App configuration (Server URL, Terminal Code, Default Printer)
  getConfig: () => ipcRenderer.invoke('pos:get-config'),
  saveConfig: (cfg) => ipcRenderer.invoke('pos:save-config', cfg),

  // 4. Window controls
  toggleFullscreen: () => ipcRenderer.invoke('pos:toggle-fullscreen'),
  isDesktop: true,
});
