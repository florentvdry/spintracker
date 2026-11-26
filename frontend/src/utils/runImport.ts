import type { TFunction } from 'i18next'
import { ipcService, type ApiResult, type ImportProgress, type Json } from '@/services/ipcService'
import { useAppStore } from '@/stores/appStore'
import { useFilterStore } from '@/stores/filterStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { usePlayersStore } from '@/stores/playersStore'
import { useProgressStore } from '@/stores/progressStore'

/**
 * Runs an import (`start` picks and imports) with the progress dialog, then reloads what depends
 * on the hands. Shared by the header's buttons and the first-run wizard.
 */
export async function runImport(start: () => Promise<ApiResult>, t: TFunction): Promise<boolean> {
  const progress = useProgressStore.getState()
  const notifications = useNotificationStore.getState()
  const unsubscribe = ipcService.onImportProgress((p: ImportProgress) => {
    if (p.stage === 'counting') {
      progress.update({ progress: p.percent, message: t('header.counting', { current: p.filesProcessed + 1, total: p.totalFiles }) })
      return
    }
    let message = `${p.handsImported} ${t('common.hands')}`
    if (p.handsSkipped) message += ` (+${p.handsSkipped} ${t('common.skipped')})`
    if (p.totalHands) message += ` / ${p.totalHands}`
    // Per-room figures, passed on when the import sends them (the dialog then shows a line per room).
    const { rooms, tournaments } = p as Json
    const details = rooms ? { details: { rooms, hands: p.handsImported, tournaments: tournaments ?? 0 } } : {}
    progress.update({ progress: p.percent, message, ...details })
  })

  progress.start({ title: t('header.import_hands'), message: t('header.calculating') })
  try {
    const result = await start()
    if (result.success) {
      notifications.addNotification({
        type: 'success',
        title: t('header.import_success'),
        message: t('header.import_stats', { hands: result.handsImported, skipped: result.handsSkipped || 0, files: result.filesProcessed }),
      })
      await useAppStore.getState().refreshAll()
      await usePlayersStore.getState().loadPlayers()
      await useFilterStore.getState().fetchAliases()
      return true
    }
    if (result.message !== 'Import cancelled') {
      notifications.addNotification({ type: 'error', title: t('header.import_error'), message: result.message ?? '' })
    }
  } catch (error) {
    notifications.addNotification({ type: 'error', title: t('common.error'), message: error instanceof Error ? error.message : String(error) })
  } finally {
    progress.finish()
    unsubscribe()
  }
  return false
}
