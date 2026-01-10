const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const path = require('path');

// Configure Updater
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
autoUpdater.autoDownload = false; // Ask user before downloading
const fs = require('fs');
const { spawn } = require('child_process');
const AdmZip = require('adm-zip');

let mainWindow;
let backendProcess = null;
const BACKEND_PORT = 5050;

// ============ C# Backend Management ============

function getDbPath() {
  const userDataPath = app.getPath('userData');
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }
  return path.join(userDataPath, 'poker_tracker.db');
}

function startBackend() {
  const isDev = !app.isPackaged || process.argv.includes('--dev');
  
  if (isDev) {
    const dotnetPath = 'dotnet';
    const backendDir = path.join(__dirname, 'backend');
    const dllPath = path.join(backendDir, 'bin', 'Debug', 'net8.0', 'PokerTrackerBackend.dll');

    // Check if compiled DLL exists
    if (!fs.existsSync(dllPath)) {
      console.log('[Backend] DLL not found, building project...');
      // Try to build the project first
      const buildProcess = spawn(dotnetPath, ['build'], {
        cwd: backendDir,
        stdio: 'inherit'
      });

      buildProcess.on('close', (code) => {
        if (code === 0) {
          console.log('[Backend] Build successful, starting backend...');
          startBackendProcess();
        } else {
          console.error('[Backend] Build failed!');
        }
      });
    } else {
      startBackendProcess();
    }
  } else {
    startBackendProcess();
  }
}

function startBackendProcess() {
  const isDev = !app.isPackaged || process.argv.includes('--dev');
  const dbPath = getDbPath();
  
  let command;
  let args;
  let cwd;

  if (isDev) {
    command = 'dotnet';
    args = ['run', BACKEND_PORT.toString(), `--db-path=${dbPath}`];
    cwd = path.join(__dirname, 'backend');
  } else {
    // In production, the backend is in the resources folder
    cwd = path.join(process.resourcesPath, 'backend');
    command = path.join(cwd, 'PokerTrackerBackend.exe');
    args = [BACKEND_PORT.toString(), `--db-path=${dbPath}`];
    
    // Fallback for different packaging structures
    if (!fs.existsSync(command)) {
      cwd = path.join(__dirname, '..', 'backend');
      command = path.join(cwd, 'PokerTrackerBackend.exe');
    }
  }

  console.log(`[Backend] Starting: ${command} in ${cwd}`);
  console.log(`[Backend] DB Path: ${dbPath}`);

  backendProcess = spawn(command, args, {
    cwd: cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  backendProcess.stdout.on('data', (data) => {
    const message = data.toString().trim();
    if (message.includes('ERROR') || message.includes('Starting') || message.includes('info:') || message.includes('warn:') || message.includes('fail:') || message.includes('API Debug')) {
      console.log(`[Backend] ${message}`);
    }
  });

  backendProcess.stderr.on('data', (data) => {
    const message = data.toString().trim();
    // Filter out routine request logging
    if (!message.includes('127.0.0.1') && !message.includes('HTTP/1.1')) {
      console.error(`[Backend] ${message}`);
    }
  });

  backendProcess.on('close', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`Backend exited with code ${code}`);
    }
    backendProcess = null;
  });

  backendProcess.on('error', (err) => {
    console.error('Failed to start backend:', err.message);
    backendProcess = null;
  });
}

function stopBackend() {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
}

async function callBackendAPI(endpoint, data = {}, method = 'POST', timeoutMs = 86400000) {
  try {
    const fetch = (await import('node-fetch')).default;
    const AbortController = global.AbortController || (await import('abort-controller')).AbortController;
    
    const controller = new AbortController();
    // Default 24h timeout to allow long operations
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal
    };
    
    if (method === 'POST') {
      options.body = JSON.stringify(data);
    }
    
    try {
      const response = await fetch(`http://127.0.0.1:${BACKEND_PORT}${endpoint}`, options);
      return await response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    console.error(`API Call failed (${endpoint}):`, error.message);
    return { success: false, error: error.message };
  }
}

// ============ Window Management ============

function createWindow() {
  const isDev = process.argv.includes('--dev');
  
  mainWindow = new BrowserWindow({
    show: false,
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    backgroundColor: '#1a1f2e',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      webSecurity: !isDev,
    },
    frame: true,
    titleBarStyle: 'default',
    icon: path.join(__dirname, 'assets/logo.png'),
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000').catch(() => {
      const reactBuildPath = path.join(__dirname, 'frontend/dist/index.html');
      if (fs.existsSync(reactBuildPath)) {
        mainWindow.loadFile(reactBuildPath);
      }
    });
    mainWindow.webContents.openDevTools();
  } else {
    const reactBuildPath = path.join(__dirname, 'frontend/dist/index.html');
    if (fs.existsSync(reactBuildPath)) {
      mainWindow.loadFile(reactBuildPath);
    }
  }

  mainWindow.webContents.on('did-finish-load', async () => {
    // Window loaded
    // Check for updates on startup (production only)
    if (!process.argv.includes('--dev')) {
      // Small delay to ensure UI is ready to show notifications/modals
      setTimeout(() => {
        autoUpdater.checkForUpdates();
      }, 3000);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ============ App Lifecycle ============

app.whenReady().then(() => {
  startBackend();

  // Create a lightweight splash window
  splashWindow = new BrowserWindow({
    width: 420,
    height: 320,
    resizable: false,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    center: true,
    show: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  const splashPath = path.join(__dirname, 'assets', 'splash.html');
  if (fs.existsSync(splashPath)) {
    splashWindow.loadFile(splashPath);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopBackend();
});

// ============ IPC Handlers - Import ============

ipcMain.handle('import-hand-history', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Hand History Files', extensions: ['txt', 'xml'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled) {
    return { success: false, message: 'Import cancelled' };
  }

  try {
    const fetch = (await import('node-fetch')).default;
    let totalHandsImported = 0;
    let totalFiles = result.filePaths.length;
    let filesProcessed = 0;
    let errors = [];

    for (const filePath of result.filePaths) {
      try {
        console.log(`[Import] Starting optimized import for: ${filePath}`);
        
        const response = await fetch(`http://127.0.0.1:${BACKEND_PORT}/import/file`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath })
        });

        if (!response.ok) {
           throw new Error(`Backend returned ${response.status}`);
        }

        // Handle SSE stream
        await new Promise((resolve, reject) => {
          let buffer = '';
          
          response.body.on('data', (chunk) => {
            buffer += chunk.toString();
            const parts = buffer.split('\n\n');
            buffer = parts.pop(); // Keep incomplete chunk

            parts.forEach((part) => {
              const lines = part.split('\n');
              lines.forEach((line) => {
                if (line.startsWith('data:')) {
                  const jsonText = line.replace(/^data:\s*/,'');
                  try {
                    const progress = JSON.parse(jsonText);
                    
                    if (progress.error) {
                        errors.push({ file: path.basename(filePath), error: progress.error });
                    }
                    
                    // Update UI with progress
                    // We might need to track accumulated hands if multiple files
                    // For simplicity, let's say TotalHands is per file.
                    // But the UI expects global progress.
                    
                    // Current file percent
                    const filePercent = progress.Percent || 0;
                    // Global percent (approximate)
                    const globalPercent = Math.round(((filesProcessed * 100) + filePercent) / totalFiles);
                    
                    mainWindow.webContents.send('import-progress', {
                      filesProcessed: filesProcessed,
                      totalFiles: totalFiles,
                      percent: globalPercent,
                      handsImported: totalHandsImported + (progress.HandsImported || 0),
                      totalHands: 'Calculating...' // Backend gives estimate per file, hard to sum up front
                    });

                    if (progress.Success) {
                        totalHandsImported += (progress.HandsImported || 0);
                    }
                  } catch (e) {
                    console.error('[Import] Parse error:', e);
                  }
                }
              });
            });
          });

          response.body.on('end', () => {
            resolve();
          });

          response.body.on('error', (err) => {
            reject(err);
          });
        });

        filesProcessed++;

      } catch (err) {
        console.error(`[Import] Error processing ${filePath}:`, err);
        errors.push({ file: path.basename(filePath), error: err.message });
        filesProcessed++;
      }
    }

    return {
      success: true,
      handsImported: totalHandsImported,
      filesProcessed: filesProcessed,
      errors: errors
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

// ============ IPC Handlers - Database Queries ============

ipcMain.handle('get-dashboard-stats', async (event, heroName) => {
  console.log('[Main] get-dashboard-stats called for:', heroName);
  const query = heroName ? `?heroName=${encodeURIComponent(heroName)}` : '';
  const result = await callBackendAPI(`/db/dashboard-stats${query}`, {}, 'GET');
  console.log('[Main] get-dashboard-stats result:', result.success ? 'Success' : result.error);
  return result;
});

ipcMain.handle('get-session-history', async (event, limit = 50, heroName = null) => {
  return callBackendAPI('/db/session-history', { limit, heroName });
});

ipcMain.handle('get-hand-details', async (event, handId) => {
  const fetch = (await import('node-fetch')).default;
  try {
    const response = await fetch(`http://127.0.0.1:${BACKEND_PORT}/db/hand/${handId}`);
    return await response.json();
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('get-hands', async (event, options = {}) => {
  return callBackendAPI('/db/hands', options);
});

ipcMain.handle('get-tournaments', async (event, options = {}) => {
  return callBackendAPI('/db/tournaments', options);
});

ipcMain.handle('get-tournament-hands', async (event, gameId, heroName) => {
  const query = `?gameId=${encodeURIComponent(gameId)}${heroName ? `&heroName=${encodeURIComponent(heroName)}` : ''}`;
  return callBackendAPI(`/db/tournament-hands${query}`, {}, 'GET');
});

ipcMain.handle('get-winrate-chart-data', async (event, options = {}) => {
  return callBackendAPI('/db/winrate-chart', options);
});

ipcMain.handle('get-range-heatmap', async (event, filters) => {
  return callBackendAPI('/db/range-heatmap', filters || {});
});

ipcMain.handle('get-analysis-stats', async (event, filters) => {
  return callBackendAPI('/analysis/stats', filters || {});
});

ipcMain.handle('get-analysis-hands', async (event, request) => {
  return callBackendAPI('/analysis/hands', request || {});
});

ipcMain.handle('get-range-breakdown', async (event, filters) => {
  return callBackendAPI('/analysis/range-breakdown', filters || {});
});

ipcMain.handle('get-players', async (event, options = {}) => {
  return callBackendAPI('/db/players', options);
});

ipcMain.handle('delete-all-hands', async () => {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons: ['Annuler', 'Supprimer tout'],
    defaultId: 0,
    cancelId: 0,
    title: 'Confirmation',
    message: 'Supprimer toutes les mains ?',
    detail: 'Cette action est irréversible. Toutes les mains, sessions et statistiques seront définitivement supprimées.'
  });

  if (result.response === 1) {
    return callBackendAPI('/db/delete-all', {});
  } else {
    return { success: false, message: 'Action annulée par l\'utilisateur' };
  }
});

// ============ IPC Handlers - Backend C# ============

ipcMain.handle('python-health-check', async () => {
  return callBackendAPI('/health', {}, 'GET');
});

ipcMain.handle('python-calculate-equity', async (event, params) => {
  return callBackendAPI('/equity', params);
});

ipcMain.handle('python-recalculate-analytics', async () => {
  mainWindow.webContents.send('ev-recalc-progress', {
    progress: 0,
    message: 'Démarrage du recalcul des statistiques...',
  });

  try {
    const fetch = (await import('node-fetch')).default;
    const res = await fetch(`http://127.0.0.1:${BACKEND_PORT}/recalculate-analytics/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    if (!res.ok || !res.body) {
      // Try fallback: call the non-streaming endpoint to get a result object
      console.error('SSE stream not available, falling back to non-streaming call', { status: res.status, ok: res.ok });
      try {
        const fallback = await callBackendAPI('/recalculate-analytics', {});
        // Relay a final progress message
        mainWindow.webContents.send('ev-recalc-progress', { progress: 100, message: fallback && (fallback.message || fallback.error || 'Terminé'), ...fallback });
        return fallback;
      } catch (fbErr) {
        console.error('Fallback recalc call failed:', fbErr);
        const json = await res.json().catch(() => ({}));
        mainWindow.webContents.send('ev-recalc-progress', { progress: 100, message: json.error || 'Failed to start recalculation', error: true });
        return { success: false, error: json.error || 'Failed to start stream' };
      }
    }

    return await new Promise((resolve, reject) => {
      let buffer = '';
      let finalPayload = null;

      res.body.on('data', (chunk) => {
        buffer += chunk.toString();
        const parts = buffer.split('\n\n');
        buffer = parts.pop();

        parts.forEach((part) => {
          const lines = part.split('\n');
          lines.forEach((line) => {
            if (line.startsWith('data:')) {
              const jsonText = line.replace(/^data:\s*/,'');
              try {
                const payload = JSON.parse(jsonText);
                finalPayload = payload;
                mainWindow.webContents.send('ev-recalc-progress', payload);
              } catch (e) {
                // ignore parse errors
              }
            }
          });
        });
      });

      res.body.on('end', () => {
        if (finalPayload) {
          resolve(finalPayload);
        } else {
          resolve({ success: true, message: 'Recalculation finished' });
        }
      });

      res.body.on('error', (err) => {
        mainWindow.webContents.send('ev-recalc-progress', { progress: 100, message: err.message, error: true });
        reject(err);
      });
    });
  } catch (error) {
    mainWindow.webContents.send('ev-recalc-progress', { progress: 100, message: error.message, error: true });
    return { success: false, error: error.message };
  }
});

// Renderer signals that app initialization is complete
ipcMain.handle('app-ready', async () => {
  try {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.maximize();
      mainWindow.show();
    }

    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('python-analyze-range', async (event, params) => {
  return callBackendAPI('/analyze/range', params);
});

ipcMain.handle('stats-builder-evaluate', async (event, stat) => {
  return callBackendAPI('/stats/builder/evaluate', stat);
});

// ============ IPC Handlers - Updater ============

ipcMain.handle('check-for-updates', () => {
  if (process.env.NODE_ENV === 'development') {
    // In dev, we can't really check for updates, but we can simulate or log
    console.log('[Updater] Check for updates triggered (Dev Mode)');
    return;
  }
  autoUpdater.checkForUpdates();
});

ipcMain.handle('download-update', () => {
  autoUpdater.downloadUpdate();
});

ipcMain.handle('quit-and-install', () => {
  autoUpdater.quitAndInstall();
});

// AutoUpdater Events
autoUpdater.on('checking-for-update', () => {
  if (mainWindow) mainWindow.webContents.send('update-status', { status: 'checking' });
});

autoUpdater.on('update-available', (info) => {
  if (mainWindow) mainWindow.webContents.send('update-status', { 
    status: 'available', 
    version: info.version, 
    releaseNotes: info.releaseNotes 
  });
});

autoUpdater.on('update-not-available', (info) => {
  if (mainWindow) mainWindow.webContents.send('update-status', { status: 'not-available' });
});

autoUpdater.on('error', (err) => {
  console.error('[Updater] Error:', err);
  if (mainWindow) mainWindow.webContents.send('update-status', { status: 'error', error: err.message });
});

autoUpdater.on('download-progress', (progressObj) => {
  if (mainWindow) mainWindow.webContents.send('update-status', { 
    status: 'downloading', 
    progress: progressObj 
  });
});

autoUpdater.on('update-downloaded', (info) => {
  if (mainWindow) mainWindow.webContents.send('update-status', { status: 'downloaded', version: info.version });
});

// ============ IPC Handlers - Export ============

ipcMain.handle('check-server-status', async () => {
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(`http://127.0.0.1:${BACKEND_PORT}/health`);
    if (response.ok) {
        return { success: true, status: 'running' };
    }
    return { success: false, status: 'error', message: response.statusText };
  } catch (error) {
    return { success: false, status: 'stopped', message: error.message };
  }
});

ipcMain.handle('export-data', async (event, format = 'json') => {
  try {
    const handsResult = await callBackendAPI('/db/hands', { limit: 1000000 }); // Large limit to get all
    
    if (!handsResult.success) {
      return { success: false, message: 'Failed to fetch hands' };
    }
    
    const hands = handsResult.data?.hands || [];
    
    if (hands.length === 0) {
      return { success: false, message: 'No hands to export' };
    }

    // Group hands by date
    const handsByDate = {};
    hands.forEach(hand => {
      if (!hand.result) return; // Skip if no raw content
      
      const date = new Date(hand.date_time);
      const dateStr = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`; // YYYY-M-D format like Betclic example
      
      if (!handsByDate[dateStr]) {
        handsByDate[dateStr] = [];
      }
      handsByDate[dateStr].push(hand.result);
    });

    const zip = new AdmZip();
    
    // Create text files for each date
    Object.keys(handsByDate).forEach(dateStr => {
      const content = handsByDate[dateStr].join('\n\n');
      zip.addFile(`ExportHH_${dateStr}.txt`, Buffer.from(content, 'utf8'));
    });

    // Show save dialog
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Exporter les mains',
      defaultPath: `PokerTracker_Export_${new Date().toISOString().split('T')[0]}.zip`,
      filters: [
        { name: 'Zip Files', extensions: ['zip'] }
      ]
    });

    if (filePath) {
      zip.writeZip(filePath);
      return { success: true, message: `Export réussi : ${Object.keys(handsByDate).length} fichiers créés` };
    } else {
      return { success: false, message: 'Export cancelled' };
    }

  } catch (error) {
    console.error('Export error:', error);
    return { success: false, message: error.message };
  }
});

