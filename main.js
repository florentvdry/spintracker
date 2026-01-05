const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let mainWindow;
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
    let totalHandsImported = 0;
    let errors = [];
    let processedFiles = 0;

    for (const filePath of result.filePaths) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Send to Python for parsing
        const parseResult = await callPythonAPI('/parse/file', { content });
        
        if (!parseResult.success) {
          errors.push({ file: path.basename(filePath), error: parseResult.error });
          continue;
        }
        
        // Insert parsed hands into database
        if (parseResult.hands && parseResult.hands.length > 0) {
          const insertResult = await callPythonAPI('/db/insert-hands', { 
            hands: parseResult.hands 
          });
          
          if (insertResult.success) {
            totalHandsImported += insertResult.inserted;
          }
        }
        
        processedFiles++;
        
        // Send progress update
        const percent = Math.round((processedFiles / result.filePaths.length) * 100);
        mainWindow.webContents.send('import-progress', {
          processed: processedFiles,
          total: result.filePaths.length,
          percent: percent,
          handsImported: totalHandsImported
        });
        
      } catch (err) {
        errors.push({ file: path.basename(filePath), error: err.message });
      }
    }

    return {
      success: true,
      handsImported: totalHandsImported,
      filesProcessed: processedFiles,
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

ipcMain.handle('python-recalculate-ev', async () => {
  mainWindow.webContents.send('ev-recalc-progress', {
    progress: 0,
    message: 'Démarrage...',
  });

  const result = await callPythonAPI('/recalculate-ev', {});

  mainWindow.webContents.send('ev-recalc-progress', {
    progress: 100,
    message: 'Terminé',
  });

  return result;
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
