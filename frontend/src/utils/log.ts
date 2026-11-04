import { ipcService } from '@/services/ipcService'

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Writes an error to the application log file (the webview console is not kept anywhere). */
export function logError(message: string, error?: unknown): void {
  void ipcService.log('error', error === undefined ? message : `${message} ${describe(error)}`)
}

export function logWarn(message: string): void {
  void ipcService.log('warn', message)
}
