/**
 * Logger service for the frontend
 * Redirects logs to the Electron main process via IPC
 */

const isElectron = typeof window !== 'undefined' && window.require;
const ipcRenderer = isElectron ? window.require('electron').ipcRenderer : null;

/**
 * Safely serialize a value for IPC transmission
 * Handles Error objects, circular references, and non-clonable values
 */
function safeSerializeForIPC(args) {
  if (!args || args.length === 0) return [];
  
  return args.map(arg => {
    if (arg === null || arg === undefined) {
      return String(arg);
    }
    if (arg instanceof Error) {
      return arg.message || arg.toString();
    }
    if (typeof arg === 'function') {
      return '[Function]';
    }
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg);
      } catch (e) {
        return String(arg);
      }
    }
    return arg;
  });
}

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
    if (ipcRenderer) {
      try {
        const safeArgs = safeSerializeForIPC(args);
        ipcRenderer.send('frontend-log', { level, message, args: safeArgs });
      } catch (e) {
        // Silently fail if IPC fails - don't create a loop
      }
    }
  }

  init() {
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    const originalDebug = console.debug;

    console.log = (message, ...args) => {
      originalLog.apply(console, [message, ...args]);
      const safeArgs = safeSerializeForIPC(args);
      if (typeof message === 'string') {
        this._log('info', message, safeArgs);
      } else {
        this._log('info', '[Object]', safeArgs);
      }
    };

    console.error = (message, ...args) => {
      originalError.apply(console, [message, ...args]);
      const safeArgs = safeSerializeForIPC(args);
      if (typeof message === 'string') {
        this._log('error', message, safeArgs);
      } else {
        this._log('error', '[Error Object]', safeArgs);
      }
    };

    console.warn = (message, ...args) => {
      originalWarn.apply(console, [message, ...args]);
      const safeArgs = safeSerializeForIPC(args);
      if (typeof message === 'string') {
        this._log('warn', message, safeArgs);
      } else {
        this._log('warn', '[Warn Object]', safeArgs);
      }
    };

    console.debug = (message, ...args) => {
      originalDebug.apply(console, [message, ...args]);
      const safeArgs = safeSerializeForIPC(args);
      if (typeof message === 'string') {
        this._log('debug', message, safeArgs);
      } else {
        this._log('debug', '[Debug Object]', safeArgs);
      }
    };

    originalLog.apply(console, ['[INFO] Frontend logger initialized and bridged to Main process']);
  }
}

export const logger = new Logger();
export default logger;
