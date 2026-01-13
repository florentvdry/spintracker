/**
 * Logger service for the frontend
 * Redirects logs to the Electron main process via IPC
 */

const isElectron = typeof window !== 'undefined' && window.require;
const ipcRenderer = isElectron ? window.require('electron').ipcRenderer : null;

class Logger {
  info(message, ...args) {
    this._log('info', message, args);
  }

  warn(message, ...args) {
    this._log('warn', message, args);
  }

  error(message, ...args) {
    this._log('error', message, args);
  }

  debug(message, ...args) {
    this._log('debug', message, args);
  }

  _log(level, message, args) {
    // Send to main process
    if (ipcRenderer) {
      ipcRenderer.send('frontend-log', { level, message, args });
    }
  }

  /**
   * Overrides the global console object to automatically capture all logs
   */
  init() {
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    const originalDebug = console.debug;

    console.log = (message, ...args) => {
      originalLog.apply(console, [message, ...args]);
      if (typeof message === 'string') {
        this._log('info', message, args);
      } else {
        this._log('info', '[Object]', [message, ...args]);
      }
    };

    console.error = (message, ...args) => {
      originalError.apply(console, [message, ...args]);
      if (typeof message === 'string') {
        this._log('error', message, args);
      } else {
        this._log('error', '[Error Object]', [message, ...args]);
      }
    };

    console.warn = (message, ...args) => {
      originalWarn.apply(console, [message, ...args]);
      if (typeof message === 'string') {
        this._log('warn', message, args);
      } else {
        this._log('warn', '[Warn Object]', [message, ...args]);
      }
    };

    console.debug = (message, ...args) => {
      originalDebug.apply(console, [message, ...args]);
      if (typeof message === 'string') {
        this._log('debug', message, args);
      } else {
        this._log('debug', '[Debug Object]', [message, ...args]);
      }
    };

    originalLog.apply(console, ['[INFO] Frontend logger initialized and bridged to Main process']);
  }
}

export const logger = new Logger();
export default logger;
