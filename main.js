const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const Database = require('./electron/database/database');
const HandParser = require('./electron/parser/handParser');

let mainWindow;
let db;
let pythonProcess = null;
const PYTHON_PORT = 5050;

// ============ Python Backend Management ============

function startPythonBackend() {
  const pythonPath = process.platform === 'win32' ? 'python' : 'python3';
  const serverPath = path.join(__dirname, 'backend', 'server.py');

  console.log('Starting Python backend on port', PYTHON_PORT);

  pythonProcess = spawn(pythonPath, [serverPath, PYTHON_PORT.toString()], {
    cwd: path.join(__dirname, 'backend'),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  pythonProcess.stdout.on('data', (data) => {
    console.log(`[Python] ${data.toString().trim()}`);
  });

  pythonProcess.stderr.on('data', (data) => {
    console.error(`[Python Error] ${data.toString().trim()}`);
  });

  pythonProcess.on('close', (code) => {
    console.log(`Python backend exited with code ${code}`);
    pythonProcess = null;
  });

  pythonProcess.on('error', (err) => {
    console.error('Failed to start Python backend:', err);
    pythonProcess = null;
  });
}

function stopPythonBackend() {
  if (pythonProcess) {
    console.log('Stopping Python backend...');
    pythonProcess.kill();
    pythonProcess = null;
  }
}

async function callPythonAPI(endpoint, data = {}) {
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(`http://127.0.0.1:${PYTHON_PORT}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await response.json();
  } catch (error) {
    console.error(`Python API error (${endpoint}):`, error.message);
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

  // En développement, charger Vite dev server
  // En production, charger le build React
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
  // Initialize database
  db = new Database();

  // Start Python backend
  startPythonBackend();

  // Optional: force EV recalculation
  if (process.argv.includes('--recalc-ev')) {
    db.recalculateAllEV();
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

// IPC Handlers
ipcMain.handle('import-hand-history', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Text Files', extensions: ['txt'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled) {
    return { success: false, message: 'Import cancelled' };
  }

  try {
    const parser = new HandParser();
    let totalHandsImported = 0;
    let errors = [];
    const readline = require('readline');

    // First pass: Count total hands for progress bar
    let estimatedTotalHands = 0;
    for (const filePath of result.filePaths) {
      const content = fs.readFileSync(filePath, 'utf8');
      // Count separators
      const matches = content.match(/------------/g);
      if (matches) {
        estimatedTotalHands += matches.length;
      }
      // Add 1 for the last hand if file doesn't end with separator
      if (content.trim().length > 0) estimatedTotalHands++;
    }

    const startTime = Date.now();
    let processedCount = 0;
    let batch = [];
    const BATCH_SIZE = 500; // Insert every 500 hands

    for (const filePath of result.filePaths) {
      try {
        const fileStream = fs.createReadStream(filePath);
        const rl = readline.createInterface({
          input: fileStream,
          crlfDelay: Infinity
        });

        let currentHandLines = [];

        for await (const line of rl) {
          // Check for separator
          if (line.trim() === '------------') {
            if (currentHandLines.length > 0) {
              const handText = currentHandLines.join('\n');
              const hand = parser.parseHand(handText);
              if (hand) {
                batch.push(hand);
              }
              currentHandLines = [];

              // Process batch
              if (batch.length >= BATCH_SIZE) {
                const inserted = db.insertHandsBatch(batch);
                totalHandsImported += inserted;
                processedCount += batch.length;
                batch = [];

                // Send progress update
                const elapsedSeconds = (Date.now() - startTime) / 1000;
                const speed = Math.round(processedCount / elapsedSeconds);
                const percent = Math.min(100, Math.round((processedCount / estimatedTotalHands) * 100));
                
                mainWindow.webContents.send('import-progress', {
                  processed: processedCount,
                  total: estimatedTotalHands,
                  percent: percent,
                  speed: speed
                });
              }
            }
          } else {
            currentHandLines.push(line);
          }
        }

        // Process the last hand if any
        if (currentHandLines.length > 0) {
          const handText = currentHandLines.join('\n');
          const hand = parser.parseHand(handText);
          if (hand) {
            batch.push(hand);
          }
        }
      } catch (err) {
        errors.push({ file: path.basename(filePath), error: err.message });
      }
    }

    // Process remaining batch
    if (batch.length > 0) {
      const inserted = db.insertHandsBatch(batch);
      totalHandsImported += inserted;
      processedCount += batch.length;
      
      // Final progress update
      const elapsedSeconds = (Date.now() - startTime) / 1000;
      const speed = Math.round(processedCount / elapsedSeconds);
      
      mainWindow.webContents.send('import-progress', {
        processed: processedCount,
        total: estimatedTotalHands,
        percent: 100,
        speed: speed
      });
    }

    return {
      success: true,
      handsImported: totalHandsImported,
      filesProcessed: result.filePaths.length,
      errors: errors
    };
  } catch (error) {
    return {
      success: false,
      message: error.message
    };
  }
});

ipcMain.handle('get-dashboard-stats', async () => {
  try {
    const stats = db.getDashboardStats();
    return { success: true, data: stats };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('get-session-history', async (event, limit = 50) => {
  try {
    const sessions = db.getSessionHistory(limit);
    return { success: true, data: sessions };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('get-hand-details', async (event, handId) => {
  try {
    const hand = db.getHandById(handId);
    return { success: true, data: hand };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('analyze-leaks', async (event, options) => {
  try {
    const leaks = db.analyzeLeaks(options);
    return { success: true, data: leaks };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('get-range-heatmap', async (event, filters) => {
  try {
    const heatmap = db.getRangeHeatmap(filters);
    return { success: true, data: heatmap };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('get-winrate-chart-data', async (event, options = {}) => {
  try {
    const data = db.getWinrateChartData(options);
    return { success: true, data: data };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('get-players', async (event, options = {}) => {
  try {
    const data = db.getPlayersOverview(options);
    return { success: true, data };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('delete-all-hands', async () => {
  try {
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
      const deleteResult = db.deleteAllHands();
      return deleteResult;
    } else {
      return { success: false, message: 'Action annulée par l\'utilisateur' };
    }
  } catch (error) {
    return { success: false, message: error.message };
  }
});

// ============ IPC Handlers - Hands Pagination ============

ipcMain.handle('get-hands', async (event, options = {}) => {
  try {
    const hands = db.getHands(options);
    return { success: true, data: hands };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

// ============ IPC Handlers - Python Backend ============

ipcMain.handle('python-health-check', async () => {
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(`http://127.0.0.1:${PYTHON_PORT}/health`);
    return await response.json();
  } catch (error) {
    return { success: false, available: false, error: error.message };
  }
});

ipcMain.handle('python-calculate-equity', async (event, params) => {
  return callPythonAPI('/equity', params);
});

ipcMain.handle('python-analyze-leaks', async (event, options) => {
  try {
    const hands = db.getAllHandsForAnalysis ? db.getAllHandsForAnalysis() : [];
    
    mainWindow.webContents.send('analysis-progress', {
      stage: 'Chargement',
      progress: 10,
      message: `${hands.length} mains chargées`,
    });

    const result = await callPythonAPI('/analyze/leaks', { hands, options });

    mainWindow.webContents.send('analysis-progress', {
      stage: 'Terminé',
      progress: 100,
      message: 'Analyse complète',
    });

    return result;
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('python-recalculate-ev', async () => {
  try {
    const hands = db.getAllHandsForEVRecalc ? db.getAllHandsForEVRecalc() : [];
    const total = hands.length;

    mainWindow.webContents.send('ev-recalc-progress', {
      progress: 0,
      message: 'Démarrage...',
      handsProcessed: 0,
      totalHands: total,
    });

    const BATCH_SIZE = 100;
    let processed = 0;

    for (let i = 0; i < hands.length; i += BATCH_SIZE) {
      const batch = hands.slice(i, i + BATCH_SIZE);
      const result = await callPythonAPI('/equity/batch', {
        hands: batch.map(h => ({
          id: h.id,
          heroCards: h.hero_cards,
          villainCards: h.villain_cards,
          board: [h.flop, h.turn, h.river].filter(Boolean).join(' '),
        })),
        iterations: 5000,
      });

      if (result.success && result.data) {
        for (const ev of result.data) {
          if (ev.equity !== undefined && db.updateHandEV) {
            db.updateHandEV(ev.id, ev.equity);
          }
        }
      }

      processed += batch.length;
      const progress = Math.round((processed / total) * 100);

      mainWindow.webContents.send('ev-recalc-progress', {
        progress,
        message: `${processed}/${total} mains`,
        handsProcessed: processed,
        totalHands: total,
      });
    }

    return { success: true, handsProcessed: processed };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('python-analyze-range', async (event, params) => {
  return callPythonAPI('/analyze/range', params);
});

// ============ IPC Handlers - Export ============

ipcMain.handle('export-data', async (event, format = 'json') => {
  try {
    const hands = db.getAllHands ? db.getAllHands() : [];
    const data = JSON.stringify(hands, null, 2);

    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `poker_data_${Date.now()}.json`,
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
    });

    if (!result.canceled && result.filePath) {
      fs.writeFileSync(result.filePath, data);
      return { success: true, message: `Exported ${hands.length} hands` };
    }

    return { success: false, message: 'Export cancelled' };
  } catch (error) {
    return { success: false, message: error.message };
  }
});
