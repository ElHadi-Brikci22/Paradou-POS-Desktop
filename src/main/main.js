const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');

let mainWindow = null;
const isDev = process.argv.includes('--dev');

// User config file in app data directory
const configPath = path.join(app.getPath('userData'), 'pos-config.json');

function loadConfig() {
  const defaultConfig = {
    serverUrl: process.env.SERVER_URL || 'http://127.0.0.1:8000',
    terminalCode: 'POS-CAISSE-01',
    defaultPrinter: '',
    receiptPrinter: '',
    tagPrinter: '',
    autoPrintReceipt: true,
    autoPrintTags: true,
    ticketWidth: '80mm',
    kioskMode: false,
  };

  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf8');
      return { ...defaultConfig, ...JSON.parse(data) };
    }
  } catch (err) {
    console.error('Error loading config:', err);
  }

  return defaultConfig;
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error saving config:', err);
    return false;
  }
}

function createWindow() {
  const config = loadConfig();

  mainWindow = new BrowserWindow({
    width: 1366,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    title: 'PARADOU - Caisse Tactile & Blanchisserie (Dual Mode)',
    autoHideMenuBar: true,
    kiosk: config.kioskMode,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const targetUrl = config.serverUrl || 'http://127.0.0.1:8000';

  // Load the live full web application
  mainWindow.loadURL(targetUrl).catch((err) => {
    console.warn('Initial loadURL failed, loading offline rescue page:', err.message);
    mainWindow.loadFile(path.join(__dirname, '../renderer/offline_retry.html'));
  });

  // Intercept failed navigations or lost connections
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDesc, validatedURL, isMainFrame) => {
    // If main frame fails to load the server
    if (isMainFrame !== false && mainWindow && !mainWindow.isDestroyed()) {
      console.warn(`Connection failed to ${validatedURL} [${errorCode}]: ${errorDesc}`);
      mainWindow.loadFile(path.join(__dirname, '../renderer/offline_retry.html'));
    }
  });

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// -------------------------------------------------------------
// IPC HANDLERS
// -------------------------------------------------------------

// 1. Get system printers for ESC/POS thermal printing
ipcMain.handle('pos:get-printers', async () => {
  if (!mainWindow) return [];
  try {
    const printers = await mainWindow.webContents.getPrintersAsync();
    return printers.map((p) => ({
      name: p.name,
      displayName: p.displayName || p.name,
      isDefault: p.isDefault,
      status: p.status,
    }));
  } catch (err) {
    console.error('Error getting printers:', err);
    return [];
  }
});

// 2. Silent Thermal Print
ipcMain.handle('pos:silent-print', async (event, { htmlContent, printerName }) => {
  return new Promise((resolve) => {
    const printWin = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

    printWin.webContents.on('did-finish-load', () => {
      const printOptions = {
        silent: true,
        printBackground: true,
        margins: {
          marginType: 'none',
        },
      };

      if (printerName) {
        printOptions.deviceName = printerName;
      }

      printWin.webContents.print(printOptions, (success, errorType) => {
        printWin.close();
        if (!success) {
          resolve({ success: false, error: errorType });
        } else {
          resolve({ success: true });
        }
      });
    });

    printWin.webContents.on('did-fail-load', (_, errorCode, errorDesc) => {
      printWin.close();
      resolve({ success: false, error: errorDesc });
    });
  });
});

// 3. Cloud Ping Check for Network Watchdog
ipcMain.handle('pos:ping-cloud', async (event, serverUrl) => {
  const urlToPing = serverUrl || loadConfig().serverUrl;
  const pingEndpoint = `${urlToPing.replace(/\/$/, '')}/api/pos/ping`;

  return new Promise((resolve) => {
    try {
      const parsedUrl = new URL(pingEndpoint);
      const transport = parsedUrl.protocol === 'https:' ? https : http;

      const req = transport.get(
        pingEndpoint,
        {
          timeout: 4000,
          headers: { 'Accept': 'application/json' },
        },
        (res) => {
          let rawData = '';
          res.on('data', (chunk) => (rawData += chunk));
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              try {
                const parsed = JSON.parse(rawData);
                resolve({ online: true, serverTime: parsed.server_time, version: parsed.api_version });
              } catch {
                resolve({ online: true });
              }
            } else {
              resolve({ online: false, status: res.statusCode });
            }
          });
        }
      );

      req.on('error', (err) => {
        resolve({ online: false, error: err.message });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ online: false, error: 'timeout' });
      });
    } catch (e) {
      resolve({ online: false, error: e.message });
    }
  });
});

// 4. Configuration Handlers
ipcMain.handle('pos:get-config', () => loadConfig());
ipcMain.handle('pos:save-config', (event, newConfig) => saveConfig(newConfig));

// 5. Fullscreen / Kiosk Toggle
ipcMain.handle('pos:toggle-fullscreen', () => {
  if (!mainWindow) return false;
  const isFull = mainWindow.isFullScreen();
  mainWindow.setFullScreen(!isFull);
  return !isFull;
});

// 6. Navigation & Connection Handlers
ipcMain.handle('pos:retry-connection', async () => {
  if (!mainWindow) return { success: false, error: 'no_window' };
  const config = loadConfig();
  const targetUrl = config.serverUrl || 'http://127.0.0.1:8000';
  try {
    await mainWindow.loadURL(targetUrl);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('pos:open-emergency-ui', () => {
  if (!mainWindow) return false;
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  return true;
});

// App Lifecycle
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
