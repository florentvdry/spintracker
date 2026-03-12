const { app, BrowserWindow, ipcMain, dialog, shell, desktopCapturer } = require('electron');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const AdmZip = require('adm-zip');

// ============ Logging Configuration ============
// Configure electron-log
log.initialize();
log.transports.file.level = 'info';
log.transports.console.level = 'debug';

// Optional: customize log file name/path
// log.transports.file.fileName = 'main.log';

// Catch unhandled errors and promise rejections
log.errorHandler.startCatching();

// Redirect console to electron-log
Object.assign(console, log.functions);

console.log('--- App Starting ---');
console.log(`Version: ${app.getVersion()}`);
console.log(`Platform: ${process.platform}`);
console.log(`Arch: ${process.arch}`);
console.log(`UserData: ${app.getPath('userData')}`);
console.log(`LogPath: ${log.transports.file.getFile().path}`);

// Configure Updater
autoUpdater.logger = log;
autoUpdater.autoDownload = false; // Ask user before downloading

let mainWindow;
let splashWindow;
let lastReplayerData = null;
let backendProcess = null;
let isBackendStarting = false;
const BACKEND_PORT = 5050;

// ============ C# Backend Management ============

function getDbPath() {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'poker_tracker.db');

  // Migration logic: if new DB doesn't exist, try to copy from old location
  if (!fs.existsSync(dbPath)) {
    const oldFolderName = 'poker-tracker-pro';
    const oldUserDataPath = path.join(path.dirname(userDataPath), oldFolderName);
    const oldDbPath = path.join(oldUserDataPath, 'poker_tracker.db');

    if (fs.existsSync(oldDbPath)) {
      console.log(`Attempting to migrate database from ${oldDbPath} to ${dbPath}`);
      try {
        if (!fs.existsSync(userDataPath)) {
          fs.mkdirSync(userDataPath, { recursive: true });
        }
        fs.copyFileSync(oldDbPath, dbPath);
        console.log('Database migration successful.');
        
        // Also try to migrate the config.json if it exists (for electron-store)
        const oldConfigPath = path.join(oldUserDataPath, 'config.json');
        const newConfigPath = path.join(userDataPath, 'config.json');
        if (fs.existsSync(oldConfigPath)) {
          fs.copyFileSync(oldConfigPath, newConfigPath);
          console.log('Config migration successful.');
        }
      } catch (err) {
        console.error('Failed to migrate database or config:', err);
      }
    }
  }

  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }
  return dbPath;
}

function startBackend() {
  if (backendProcess || isBackendStarting) return;
  isBackendStarting = true;
  
  const isDev = !app.isPackaged || process.argv.includes('--dev');
  
  if (isDev) {
    const dotnetPath = 'dotnet';
    const backendDir = path.join(__dirname, 'backend');
    const dllPath = path.join(backendDir, 'bin', 'Debug', 'net8.0', 'SpinTrackerBackend.dll');

    // Check if compiled DLL exists
    if (!fs.existsSync(dllPath)) {
      // Try to build the project first
      const buildProcess = spawn(dotnetPath, ['build'], {
        cwd: backendDir,
        stdio: 'inherit'
      });

      buildProcess.on('close', (code) => {
        if (code === 0) {
          startBackendProcess();
        } else {
          console.error('[Backend] Build failed!');
          isBackendStarting = false;
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
    args = ['run', '--', BACKEND_PORT.toString(), `--db-path=${dbPath}`];
    cwd = path.join(__dirname, 'backend');
  } else {
    // In production, the backend is in the resources folder
    cwd = path.join(process.resourcesPath, 'backend');
    command = path.join(cwd, 'SpinTrackerBackend.exe');
    args = [BACKEND_PORT.toString(), `--db-path=${dbPath}`];
    
    // Fallback for different packaging structures
    if (!fs.existsSync(command)) {
      cwd = path.join(__dirname, '..', 'backend');
      command = path.join(cwd, 'SpinTrackerBackend.exe');
    }
  }


  backendProcess = spawn(command, args, {
    cwd: cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  backendProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
      const message = line.trim();
      if (!message) return;
      
      // Filter out noisy routine HTTP request logs from ASP.NET Core
      if (message.includes('info: Microsoft.AspNetCore.Hosting.Diagnostics') || 
          message.includes('info: Microsoft.AspNetCore.Routing.EndpointMiddleware')) {
        return;
      }
      
      console.log(`[Backend] ${message}`);
    });
  });

  backendProcess.stderr.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
      const message = line.trim();
      if (!message) return;
      
      // Still filter out standard dev server noises but keep actual errors
      if (message.includes('127.0.0.1') && message.includes('HTTP/1.1')) {
        return;
      }
      
      console.error(`[Backend-Err] ${message}`);
    });
  });

  backendProcess.on('close', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`Backend exited with code ${code}`);
    }
    backendProcess = null;
    isBackendStarting = false;
  });

  backendProcess.on('error', (err) => {
    console.error('Failed to start backend:', err.message);
    backendProcess = null;
    isBackendStarting = false;
  });
}

function stopBackend() {
  if (backendProcess) {
    if (process.platform === 'win32') {
      // On Windows, child_process.kill() doesn't kill the entire process tree (orphans dotnet run apps)
      // Use taskkill to ensure the whole tree is gone
      const { exec } = require('child_process');
      exec(`taskkill /pid ${backendProcess.pid} /T /F`, (err) => {
        if (err) {
          console.error(`Failed to kill backend process tree: ${err.message}`);
        }
      });
    } else {
      backendProcess.kill();
    }
    backendProcess = null;
    isBackendStarting = false;
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

function createReplayerWindow(handData) {
  const isDev = process.argv.includes('--dev');
  
  const replayerWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    resizable: true,
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
    replayerWindow.loadURL('http://localhost:3000/replayer.html').catch(() => {
      const replayerPath = path.join(__dirname, 'frontend/dist/replayer.html');
      if (fs.existsSync(replayerPath)) {
        replayerWindow.loadFile(replayerPath);
      }
    });
  } else {
    const replayerPath = path.join(__dirname, 'frontend/dist/replayer.html');
    if (fs.existsSync(replayerPath)) {
      replayerWindow.loadFile(replayerPath);
    }
  }

  replayerWindow.webContents.on('did-finish-load', () => {
    // Send the hand data to the replayer window
    replayerWindow.webContents.send('load-replayer-data', handData);
  });

  replayerWindow.on('closed', () => {
    // Cleanup if needed
  });
}

// ============ App Lifecycle ============

app.whenReady().then(() => {
  startBackend();

  ipcMain.handle('replayer-get-data', () => {
    console.log('[Main] replayer-get-data invoked, returning stored data');
    return lastReplayerData;
  });

  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });

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

app.on('will-quit', () => {
  stopBackend();
});

// ============ IPC Handlers - Import ============

ipcMain.handle('import-hand-history', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Hand History Files', extensions: ['txt', 'xml', 'zip'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled) {
    return { success: false, message: 'Import cancelled' };
  }

  // Temporary directory for zip extraction
  const tempDir = path.join(app.getPath('temp'), 'SpinTracker_Import_' + Date.now());
  const filesToProcess = [];

  try {
    // 1. Prepare file list (expand zips)
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const getAllFiles = (dirPath, arrayOfFiles) => {
      const files = fs.readdirSync(dirPath);
      arrayOfFiles = arrayOfFiles || [];
      files.forEach((file) => {
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
          arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
        } else {
          // Only accept .txt files from zips (avoid garbage)
          if (file.toLowerCase().endsWith('.txt') || file.toLowerCase().endsWith('.xml')) {
            arrayOfFiles.push(fullPath);
          }
        }
      });
      return arrayOfFiles;
    };

    for (const filePath of result.filePaths) {
      if (filePath.toLowerCase().endsWith('.zip')) {
        try {
          const zip = new AdmZip(filePath);
          const extractPath = path.join(tempDir, path.basename(filePath, '.zip'));
          zip.extractAllTo(extractPath, true);
          
          const extractedFiles = getAllFiles(extractPath);
          filesToProcess.push(...extractedFiles);
        } catch (err) {
          console.error(`Failed to extract ${filePath}:`, err);
        }
      } else {
        filesToProcess.push(filePath);
      }
    }

    if (filesToProcess.length === 0) {
      return { success: false, message: 'No valid hand history files found to import.' };
    }

    const fetch = (await import('node-fetch')).default;
    
    // First, count all hands in all files to get the total upfront
    let totalHandsExpected = 0;
    let totalFiles = filesToProcess.length;
    let filesCounted = 0;
    
    for (const filePath of filesToProcess) {
      try {
        mainWindow.webContents.send('import-progress', {
          filesProcessed: filesCounted,
          totalFiles: totalFiles,
          percent: Math.round((filesCounted / totalFiles) * 10), // 0-10% for counting phase
          handsImported: 0,
          totalHands: null,
          message: `Comptage des mains... (${filesCounted + 1}/${totalFiles})`
        });

        const countResponse = await fetch(`http://127.0.0.1:${BACKEND_PORT}/import/count-hands`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath })
        });
        
        if (countResponse.ok) {
          const countResult = await countResponse.json();
          if (countResult.success && countResult.count) {
            totalHandsExpected += countResult.count;
          }
        }
        filesCounted++;
      } catch (err) {
        // If counting fails, continue anyway - we'll discover the total during import
        filesCounted++;
      }
    }

    // Now start importing with the total known
    let totalHandsImported = 0;
    let totalHandsSkipped = 0;
    let filesProcessed = 0;
    let errors = [];

    for (const filePath of filesToProcess) {
      try {
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
          let currentFileHandsSkipped = 0;
          let currentFileHandsImported = 0;
          
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
                    
                    // Current file percent (0-100%)
                    const filePercent = progress.Percent || 0;
                    // Global percent: counting phase was 0-10%, import phase is 10-100%
                    // Each file's import contributes to the remaining 90% proportionally
                    const fileContribution = 90 / totalFiles; // Each file contributes this % to total
                    const currentFileProgress = Math.round((filePercent * fileContribution) / 100);
                    const globalPercent = 10 + Math.round((filesProcessed * fileContribution) + currentFileProgress);
                    
                    // Calculate accumulated totals
                    currentFileHandsImported = progress.HandsImported || 0;
                    currentFileHandsSkipped = progress.HandsSkipped || 0;

                    const accumulatedHandsImported = totalHandsImported + currentFileHandsImported;
                    const accumulatedHandsSkipped = totalHandsSkipped + currentFileHandsSkipped;
                    
                    mainWindow.webContents.send('import-progress', {
                      filesProcessed: filesProcessed,
                      totalFiles: totalFiles,
                      percent: Math.min(100, globalPercent),
                      handsImported: accumulatedHandsImported,
                      handsSkipped: accumulatedHandsSkipped,
                      totalHands: totalHandsExpected > 0 ? totalHandsExpected : null
                    });

                    if (progress.Success) {
                        totalHandsImported += currentFileHandsImported;
                        totalHandsSkipped += currentFileHandsSkipped;
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
      handsSkipped: totalHandsSkipped,
      filesProcessed: filesProcessed,
      errors: errors
    };
  } catch (error) {
    return { success: false, message: error.message };
  } finally {
    // Cleanup temp directory
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (e) {
      console.error('Failed to cleanup temp dir:', e);
    }
  }
});

// ============ IPC Handlers - Database Queries ============

ipcMain.handle('get-dashboard-stats', async (event, heroName, dateFrom, dateTo, buyIn) => {
  let query = heroName ? `?heroName=${encodeURIComponent(heroName)}` : '';
  if (dateFrom) query += (query ? '&' : '?') + `dateFrom=${encodeURIComponent(dateFrom)}`;
  if (dateTo) query += (query ? '&' : '?') + `dateTo=${encodeURIComponent(dateTo)}`;
  if (buyIn) query += (query ? '&' : '?') + `buyIn=${encodeURIComponent(buyIn)}`;
  
  const result = await callBackendAPI(`/db/dashboard-stats${query}`, {}, 'GET');
  return result;
});

ipcMain.handle('get-session-history', async (event, limit = 50, heroName = null, dateFrom = null, dateTo = null, buyIn = null) => {
  return callBackendAPI('/db/session-history', { limit, heroName, dateFrom, dateTo, buyIn });
});

ipcMain.handle('get-hand-details', async (event, handId, heroName) => {
  const fetch = (await import('node-fetch')).default;
  try {
    const query = heroName ? `?heroName=${encodeURIComponent(heroName)}` : '';
    const response = await fetch(`http://127.0.0.1:${BACKEND_PORT}/db/hand/${encodeURIComponent(handId)}${query}`);
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

ipcMain.handle('get-buy-ins', async (event) => {
  return callBackendAPI('/db/buyins', {}, 'GET');
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
    const deleteResult = await callBackendAPI('/db/delete-all', {});
    // Also reset default stats and profiles when resetting data
    if (deleteResult.success) {
      await callBackendAPI('/reset-default-stats', {}, 'POST');
    }
    return deleteResult;
  } else {
    return { success: false, message: 'Action annulée par l\'utilisateur' };
  }
});

ipcMain.handle('reset-default-stats', async () => {
  return callBackendAPI('/reset-default-stats', {}, 'POST');
});

// ============ IPC Handlers - Backend C# ============

ipcMain.handle('python-health-check', async () => {
  return callBackendAPI('/health', {}, 'GET');
});

ipcMain.handle('python-calculate-equity', async (event, params) => {
  return callBackendAPI('/equity', params);
});

ipcMain.handle('open-logs-folder', async () => {
  try {
    const logPath = log.transports.file.getFile().path;
    const logDir = path.dirname(logPath);
    if (fs.existsSync(logDir)) {
      await shell.openPath(logDir);
      return { success: true };
    }
    return { success: false, error: 'Logs directory does not exist' };
  } catch (error) {
    console.error('Failed to open logs folder:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.on('frontend-log', (event, { level, message, args }) => {
  const formattedArgs = args && args.length > 0 ? JSON.stringify(args) : '';
  const fullMessage = `[Frontend] ${message} ${formattedArgs}`;
  
  if (level === 'error') {
    log.error(fullMessage);
  } else if (level === 'warn') {
    log.warn(fullMessage);
  } else if (level === 'debug') {
    log.debug(fullMessage);
  } else {
    log.info(fullMessage);
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

ipcMain.handle('open-replayer', async (event, handData) => {
  lastReplayerData = handData;
  createReplayerWindow(handData);
});

ipcMain.handle('stats-builder-evaluate', async (event, stat) => {
  return callBackendAPI('/stats/builder/evaluate', stat);
});

// ============ IPC Handlers - Updater ============

ipcMain.handle('check-for-updates', () => {
  if (process.env.NODE_ENV === 'development') {
    // In dev, we can't really check for updates
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
      defaultPath: `SpinTracker_Export_${new Date().toISOString().split('T')[0]}.zip`,
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

ipcMain.handle('get-desktop-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({ 
      types: ['window', 'screen'],
      thumbnailSize: { width: 0, height: 0 }
    });
    
    if (!sources) return [];

    // Simplification stricte pour éviter les erreurs de clonage IPC
    // On ne garde que l'essentiel et on s'assure que ce sont des primitives
    const safeSources = sources.map(source => ({
      id: String(source.id),
      name: String(source.name)
    }));
    
    // Double sécurité : JSON serialization/deserialization
    return JSON.parse(JSON.stringify(safeSources));
  } catch (error) {
    console.error('Failed to get desktop sources:', error);
    return [];
  }
});

// ============ IPC Handlers - Database Management ============

ipcMain.handle('get-databases', async () => {
  return callBackendAPI('/api/databases', {}, 'GET');
});

ipcMain.handle('get-active-database', async () => {
  return callBackendAPI('/api/databases/active', {}, 'GET');
});

ipcMain.handle('create-database', async (event, name) => {
  return callBackendAPI('/api/databases', { name }, 'POST');
});

ipcMain.handle('set-active-database', async (event, id) => {
  const result = await callBackendAPI(`/api/databases/${id}/set-active`, {}, 'POST');
  if (result.success) {
    // Restart backend with new database
    console.log('[Database] Switching active database, restarting backend...');
    stopBackend();
    setTimeout(() => {
      startBackend();
    }, 1000);
  }
  return result;
});

ipcMain.handle('delete-database', async (event, id) => {
  return callBackendAPI(`/api/databases/${id}`, {}, 'DELETE');
});

ipcMain.handle('rename-database', async (event, id, name) => {
  return callBackendAPI(`/api/databases/${id}`, { name }, 'PUT');
});

