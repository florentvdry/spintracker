const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let mainWindow;
let splashWindow;
let pythonProcess = null;
const PYTHON_PORT = 5050;

// ============ Python Backend Management ============

function startPythonBackend() {
  const pythonPath = process.platform === 'win32' ? 'python' : 'python3';
  const serverPath = path.join(__dirname, 'backend', 'server.py');

  pythonProcess = spawn(pythonPath, [serverPath, PYTHON_PORT.toString()], {
    cwd: path.join(__dirname, 'backend'),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  pythonProcess.stdout.on('data', (data) => {
    const message = data.toString().trim();
    if (message.includes('ERROR') || message.includes('Starting')) {
      console.log(`[Python] ${message}`);
    }
  });

  pythonProcess.stderr.on('data', (data) => {
    const message = data.toString().trim();
    // Filter out Flask's default request logging
    if (!message.includes('127.0.0.1') && !message.includes('HTTP/1.1')) {
      console.error(`[Python] ${message}`);
    }
  });

  pythonProcess.on('close', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`Python backend exited with code ${code}`);
    }
    pythonProcess = null;
  });

  pythonProcess.on('error', (err) => {
    console.error('Failed to start Python backend:', err.message);
    pythonProcess = null;
  });
}

function stopPythonBackend() {
  if (pythonProcess) {
    pythonProcess.kill();
    pythonProcess = null;
  }
}

async function callPythonAPI(endpoint, data = {}, method = 'POST') {
  try {
    const fetch = (await import('node-fetch')).default;
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    
    if (method === 'POST') {
      options.body = JSON.stringify(data);
    }
    
    const response = await fetch(`http://127.0.0.1:${PYTHON_PORT}${endpoint}`, options);
    return await response.json();
  } catch (error) {
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
    icon: path.join(__dirname, 'assets/icon.png'),
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

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ============ App Lifecycle ============

app.whenReady().then(() => {
  startPythonBackend();

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
  stopPythonBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopPythonBackend();
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
    // First phase: parse all files to estimate total hands
    let parseResults = [];
    let parseErrors = [];

    for (const filePath of result.filePaths) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const parseResult = await callPythonAPI('/parse/file', { content });

        if (!parseResult.success) {
          parseErrors.push({ file: path.basename(filePath), error: parseResult.error });
          parseResults.push({ file: path.basename(filePath), hands: [] });
        } else {
          parseResults.push({ file: path.basename(filePath), hands: parseResult.hands || [], count: parseResult.count || (parseResult.hands || []).length });
        }
      } catch (err) {
        parseErrors.push({ file: path.basename(filePath), error: err.message });
        parseResults.push({ file: path.basename(filePath), hands: [] });
      }
    }

    const totalHandsToImport = parseResults.reduce((s, r) => s + (r.count || (r.hands || []).length), 0);

    // Second phase: insert parsed hands and send progress based on hands
    let totalHandsImported = 0;
    let insertErrors = [];
    let filesProcessed = 0;

    for (const pr of parseResults) {
      try {
        if (pr.hands && pr.hands.length > 0) {
          const insertResult = await callPythonAPI('/db/insert-hands', { hands: pr.hands });
          if (insertResult.success) {
            totalHandsImported += insertResult.inserted || 0;
          } else {
            insertErrors.push({ file: pr.file, error: insertResult.error });
          }
        }

        filesProcessed++;

        const percent = totalHandsToImport > 0 ? Math.round((totalHandsImported / totalHandsToImport) * 100) : Math.round((filesProcessed / result.filePaths.length) * 100);
        mainWindow.webContents.send('import-progress', {
          filesProcessed: filesProcessed,
          totalFiles: result.filePaths.length,
          percent: percent,
          handsImported: totalHandsImported,
          totalHands: totalHandsToImport
        });
      } catch (err) {
        insertErrors.push({ file: pr.file, error: err.message });
      }
    }

    const errors = parseErrors.concat(insertErrors);

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

ipcMain.handle('get-dashboard-stats', async () => {
  return callPythonAPI('/db/dashboard-stats', {}, 'GET');
});

ipcMain.handle('get-session-history', async (event, limit = 50) => {
  return callPythonAPI('/db/session-history', { limit });
});

ipcMain.handle('get-hand-details', async (event, handId) => {
  const fetch = (await import('node-fetch')).default;
  try {
    const response = await fetch(`http://127.0.0.1:${PYTHON_PORT}/db/hand/${handId}`);
    return await response.json();
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('get-hands', async (event, options = {}) => {
  return callPythonAPI('/db/hands', options);
});

ipcMain.handle('get-winrate-chart-data', async (event, options = {}) => {
  return callPythonAPI('/db/winrate-chart', options);
});

ipcMain.handle('get-range-heatmap', async (event, filters) => {
  return callPythonAPI('/db/range-heatmap', filters || {});
});

ipcMain.handle('get-players', async (event, options = {}) => {
  return callPythonAPI('/db/players', options);
});

ipcMain.handle('analyze-leaks', async (event, options) => {
  return callPythonAPI('/analyze/leaks', { options });
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
    return callPythonAPI('/db/delete-all', {});
  } else {
    return { success: false, message: 'Action annulée par l\'utilisateur' };
  }
});

// ============ IPC Handlers - Python Backend ============

ipcMain.handle('python-health-check', async () => {
  return callPythonAPI('/health', {}, 'GET');
});

ipcMain.handle('python-calculate-equity', async (event, params) => {
  return callPythonAPI('/equity', params);
});

ipcMain.handle('python-analyze-leaks', async (event, options) => {
  mainWindow.webContents.send('analysis-progress', {
    stage: 'Analyse',
    progress: 10,
    message: 'Chargement des mains...',
  });

  const result = await callPythonAPI('/analyze/leaks', { options });

  mainWindow.webContents.send('analysis-progress', {
    stage: 'Terminé',
    progress: 100,
    message: 'Analyse complète',
  });

  return result;
});

ipcMain.handle('python-recalculate-analytics', async () => {
  mainWindow.webContents.send('ev-recalc-progress', {
    progress: 0,
    message: 'Démarrage du recalcul des statistiques...',
  });

  try {
    const fetch = (await import('node-fetch')).default;
    const res = await fetch(`http://127.0.0.1:${PYTHON_PORT}/recalculate-analytics/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    if (!res.ok || !res.body) {
      // Try fallback: call the non-streaming endpoint to get a result object
      console.error('SSE stream not available, falling back to non-streaming call', { status: res.status, ok: res.ok });
      try {
        const fallback = await callPythonAPI('/recalculate-analytics', {});
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
      mainWindow.show();
    }

    if (splashWindow) {
      try { splashWindow.close(); } catch (e) {}
      splashWindow = null;
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('python-analyze-range', async (event, params) => {
  return callPythonAPI('/analyze/range', params);
});

// ============ IPC Handlers - Export ============

ipcMain.handle('export-data', async (event, format = 'json') => {
  try {
    const handsResult = await callPythonAPI('/db/hands', { limit: 100000 });
    
    if (!handsResult.success) {
      return { success: false, message: 'Failed to fetch hands' };
    }
    
    const hands = handsResult.data?.hands || [];
    const data = JSON.stringify(hands, null, 2);

    const saveResult = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `poker_data_${Date.now()}.json`,
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
    });

    if (!saveResult.canceled && saveResult.filePath) {
      fs.writeFileSync(saveResult.filePath, data);
      return { success: true, message: `Exported ${hands.length} hands` };
    }

    return { success: false, message: 'Export cancelled' };
  } catch (error) {
    return { success: false, message: error.message };
  }
});
