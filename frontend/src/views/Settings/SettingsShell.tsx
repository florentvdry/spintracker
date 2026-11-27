import { useCallback, useEffect, useState } from 'react'
import { Database, Info, LayoutDashboard, Monitor, Settings, Sliders, Tv } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { useLocation, useNavigate } from 'react-router-dom'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import ExportDialog from '@/components/ui/ExportDialog'
import { ipcService, type Json } from '@/services/ipcService'
import { useAppStore } from '@/stores/appStore'
import { useFilterStore } from '@/stores/filterStore'
import { usePlayersStore } from '@/stores/playersStore'
import { useUpdateStore } from '@/stores/updateStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { logError } from '@/utils/log'
import GeneralPage from './pages/GeneralPage'
import DatabasePage from './pages/DatabasePage'
import ServerPage from './pages/ServerPage'
import RangesPage from './pages/RangesPage'
import StreamerPage from './pages/StreamerPage'
import AboutPage from './pages/AboutPage'

type CategoryId = 'general' | 'database' | 'server' | 'ranges' | 'streamer' | 'about'

const STATUS_POLL_MS = 30_000
const RELOAD_AFTER_DB_SWITCH_MS = 2000

const CATEGORIES: { id: CategoryId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'general', label: 'settings.categories.general', icon: LayoutDashboard },
  { id: 'database', label: 'settings.categories.database', icon: Database },
  { id: 'server', label: 'settings.categories.server', icon: Monitor },
  { id: 'ranges', label: 'ranges.settings.title', icon: Sliders },
  { id: 'streamer', label: 'settings.categories.streamer', icon: Tv },
  { id: 'about', label: 'settings.categories.about', icon: Info },
]

function formatDbDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '?'
  const date = new Date(dateStr)
  return Number.isNaN(date.getTime()) ? '?' : date.toLocaleDateString()
}

export default function SettingsShell() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const notify = useNotificationStore()
  const refreshAll = useAppStore((s) => s.refreshAll)
  const setHeroName = useFilterStore((s) => s.setHeroName)
  const loadPlayers = usePlayersStore((s) => s.loadPlayers)
  const isChecking = useUpdateStore((s) => s.isChecking)

  const focus = (useLocation().state as { focus?: string } | null)?.focus

  // Arriving from a link that targets a card scrolls to it once its page is visible.
  useEffect(() => {
    if (focus) document.getElementById(focus)?.scrollIntoView({ block: 'start' })
  }, [focus])

  const [activeCategory, setActiveCategory] = useState<CategoryId>('general')
  const [serverActive, setServerActive] = useState<boolean | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const closeExport = useCallback(() => setExportOpen(false), [])
  const [appVersion, setAppVersion] = useState('1.0.0')
  const [databases, setDatabases] = useState<Json[]>([])
  const [loadingDatabases, setLoadingDatabases] = useState(true)
  const [creatingDb, setCreatingDb] = useState(false)
  const [newDbName, setNewDbName] = useState('')
  const [editingDbId, setEditingDbId] = useState<string | number | null>(null)
  const [editingDbName, setEditingDbName] = useState('')
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)
  const [dbToDelete, setDbToDelete] = useState<Json | null>(null)

  const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e))
  const reportError = (message: string) => notify.addNotification({ type: 'error', title: t('common.error'), message })

  const checkStatus = useCallback(async () => {
    try {
      setServerActive((await ipcService.checkServerStatus()).success)
    } catch {
      setServerActive(false)
    }
  }, [])

  const loadDatabases = useCallback(async () => {
    try {
      setLoadingDatabases(true)
      const result = await ipcService.getDatabases()
      if (result.success) setDatabases(result.data || [])
    } catch (error) {
      logError('Failed to load databases:', error)
    } finally {
      setLoadingDatabases(false)
    }
  }, [])

  useEffect(() => {
    // Open the settings page matching a `?tab=` query, defaulting to general.
    const params = new URLSearchParams(search)
    const tab = (params.get('tab') as CategoryId) ?? ''
    if (CATEGORIES.some((c) => c.id === tab)) setActiveCategory(tab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  useEffect(() => {
    void checkStatus()
    void loadDatabases()
    void ipcService.getAppVersion().then((v) => v && setAppVersion(v)).catch((e) => logError('Failed to load version:', e))
    const interval = setInterval(checkStatus, STATUS_POLL_MS)
    return () => clearInterval(interval)
  }, [checkStatus, loadDatabases])

  const handleDeleteAll = async () => {
    setConfirmDeleteAll(false)
    try {
      const result = await ipcService.deleteAllHands()
      if (result.success) {
        notify.success(t('settings.messages.data_deleted'), t('settings.messages.data_deleted_title'))
        await refreshAll()
        setHeroName(null)
        await loadPlayers()
        window.location.reload()
      } else {
        reportError(result.message || t('settings.messages.error_unknown'))
      }
    } catch (error) {
      reportError(errorMessage(error) || t('settings.messages.error_server'))
    }
  }

  const handleOpenLogs = async () => {
    const result = await ipcService.openLogsFolder().catch((e) => ({ success: false, error: errorMessage(e) }))
    if (!result.success) reportError(result.error || t('settings.messages.error_logs'))
  }

  const handleCreateDatabase = async () => {
    const name = newDbName.trim()
    if (!name) return
    try {
      setCreatingDb(true)
      const result = await ipcService.createDatabase(name)
      if (result.success) {
        notify.success(t('settings.messages.db_created', { name }), t('settings.messages.db_created_title'))
        setNewDbName('')
        await loadDatabases()
      } else {
        reportError(result.message || t('settings.messages.error_create_db'))
      }
    } catch (error) {
      reportError(errorMessage(error))
    } finally {
      setCreatingDb(false)
    }
  }

  const handleSetActiveDatabase = async (id: string | number) => {
    try {
      const result = await ipcService.setActiveDatabase(id)
      if (result.success) {
        notify.info(t('settings.messages.db_activated'), t('settings.messages.db_activated_title'))
        await loadDatabases()
        setTimeout(() => window.location.reload(), RELOAD_AFTER_DB_SWITCH_MS)
      } else {
        reportError(result.message || t('settings.messages.error_switch_db'))
      }
    } catch (error) {
      reportError(errorMessage(error))
    }
  }

  const requestDeleteDatabase = (db: Json) => {
    if (databases.length <= 1) return reportError(t('settings.database.multiple.cannot_delete_last'))
    if (db.isActive) return reportError(t('settings.database.multiple.cannot_delete_active'))
    setDbToDelete(db)
  }

  const handleDeleteDatabase = async () => {
    const db = dbToDelete
    setDbToDelete(null)
    if (!db) return
    try {
      const result = await ipcService.deleteDatabase(db.id)
      if (result.success) {
        notify.success(t('settings.messages.db_deleted', { name: db.name }), t('settings.messages.db_deleted_title'))
        await loadDatabases()
      } else {
        reportError(result.message || t('settings.messages.error_delete_db'))
      }
    } catch (error) {
      reportError(errorMessage(error))
    }
  }

  const handleRenameDatabase = async (db: Json) => {
    const name = editingDbName.trim()
    if (!name) return
    try {
      const result = await ipcService.renameDatabase(db.id, name)
      if (result.success) {
        notify.success(t('settings.messages.db_renamed', { name }), t('settings.messages.db_renamed_title'))
        setEditingDbId(null)
        setEditingDbName('')
        await loadDatabases()
      } else {
        reportError(result.message || t('settings.messages.error_rename_db'))
      }
    } catch (error) {
      reportError(errorMessage(error))
    }
  }

  const selectCategory = (id: CategoryId) => {
    setActiveCategory(id)
    // Keep the category in the query so a refresh stays on the same page.
    const params = new URLSearchParams()
    params.set('tab', id)
    navigate(`${pathname.split('?')[0]}?${params.toString()}`)
  }

  return (
    <div className="flex flex-col max-w-4xl">
      <div className="flex items-center gap-2 mb-2">
        <Settings className="w-5 h-5 text-gray-400" />
        <h1 className="page-title">{t('settings.title')}</h1>
      </div>
      <p className="page-subtitle text-gray-400 mb-6">{t('settings.subtitle')}</p>

      <div className="flex gap-4">
        <nav className="shrink-0 w-52 border border-dark-200 rounded-lg bg-dark-600">
          <ul className="divide-y divide-dark-200">
            {CATEGORIES.map((category) => {
              const Icon = category.icon
              const active = activeCategory === category.id
              return (
                <li key={category.id}>
                  <button
                    onClick={() => selectCategory(category.id)}
                    className={clsx(
                      'flex w-full items-center gap-3 px-4 py-3 text-sm transition-colors',
                      active
                        ? 'bg-primary-500/10 text-primary-400 border-r border-primary-500'
                        : 'text-gray-400 hover:bg-dark-500 hover:text-gray-200',
                    )}
                  >
                    <Icon className={clsx('w-5 h-5 shrink-0', active ? 'text-primary-400' : 'text-gray-500')} />
                    <span className="font-medium">{t(category.label)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        <main className="flex-1 overflow-y-auto min-w-0">
          {activeCategory === 'general' && <GeneralPage />}
          {activeCategory === 'database' && (
            <DatabasePage
              databases={databases}
              loadingDatabases={loadingDatabases}
              newDbName={newDbName}
              setNewDbName={setNewDbName}
              creatingDb={creatingDb}
              editingDbId={editingDbId}
              editingDbName={editingDbName}
              setEditingDbId={setEditingDbId}
              setEditingDbName={setEditingDbName}
              handleCreateDatabase={handleCreateDatabase}
              handleSetActiveDatabase={handleSetActiveDatabase}
              handleRenameDatabase={handleRenameDatabase}
              handleDeleteAll={handleDeleteAll}
              requestDeleteDatabase={requestDeleteDatabase}
              setExportOpen={setExportOpen}
              formatDbDate={formatDbDate}
            />
          )}
          {activeCategory === 'server' && <ServerPage serverActive={serverActive} checkStatus={checkStatus} />}
          {activeCategory === 'ranges' && <RangesPage />}
          {activeCategory === 'streamer' && <StreamerPage />}
          {activeCategory === 'about' && (
            <AboutPage
              appVersion={appVersion}
              isChecking={isChecking}
              handleOpenLogs={handleOpenLogs}
              checkForUpdates={() => void ipcService.checkForUpdates()}
            />
          )}
        </main>
      </div>

      {/* Cards shared across categories live in their own pages; the app-wide actions below stay here. */}
      <ExportDialog open={exportOpen} onClose={closeExport} />

      <ConfirmDialog
        open={confirmDeleteAll}
        title={t('confirm.delete_all_title')}
        detail={t('confirm.delete_all_detail')}
        confirmLabel={t('confirm.delete_all_button')}
        onConfirm={() => void handleDeleteAll()}
        onCancel={() => setConfirmDeleteAll(false)}
      />
      <ConfirmDialog
        open={!!dbToDelete}
        title={t('settings.database.multiple.confirm_delete')}
        detail={t('settings.database.multiple.delete_warning')}
        confirmLabel={t('common.delete')}
        onConfirm={() => void handleDeleteDatabase()}
        onCancel={() => setDbToDelete(null)}
      />
    </div>
  )
}
