import { useCallback, useEffect, useState } from 'react'
import { Check, Database, Download, Edit2, FolderOpen, Globe, Loader, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import Card from '@/components/ui/Card'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import ExportDialog from '@/components/ui/ExportDialog'
import { setLanguage } from '@/i18n'
import { ipcService, type Json } from '@/services/ipcService'
import { useAppStore } from '@/stores/appStore'
import { useFilterStore } from '@/stores/filterStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { usePlayersStore } from '@/stores/playersStore'
import { useUpdateStore } from '@/stores/updateStore'
import { useLocation } from 'react-router-dom'
import { AUTO_IMPORT_ANCHOR } from './anchors'
import AutoImportCard from './components/AutoImportCard'
import SettingRow from './components/SettingRow'
import { logError } from '@/utils/log'

const STATUS_POLL_MS = 30_000
const RELOAD_AFTER_DB_SWITCH_MS = 2000

function formatDbDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '?'
  const date = new Date(dateStr)
  return Number.isNaN(date.getTime()) ? '?' : date.toLocaleDateString()
}

export default function Settings() {
  const { t, i18n } = useTranslation()
  const notify = useNotificationStore()
  const refreshAll = useAppStore((s) => s.refreshAll)
  const setHeroName = useFilterStore((s) => s.setHeroName)
  const loadPlayers = usePlayersStore((s) => s.loadPlayers)
  const isChecking = useUpdateStore((s) => s.isChecking)

  const focus = (useLocation().state as { focus?: string } | null)?.focus

  // Arriving from a link that targets a card (the import light in the header) scrolls to it.
  useEffect(() => {
    if (focus) document.getElementById(focus)?.scrollIntoView({ block: 'start' })
  }, [focus])

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

  const languageButton = (code: string, label: string) => (
    <button
      onClick={() => setLanguage(code)}
      className={clsx('segmented-item', i18n.language.startsWith(code) && 'active')}
    >
      {label}
    </button>
  )

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h1 className="page-title">{t('settings.title')}</h1>
        <p className="page-subtitle">{t('settings.subtitle')}</p>
      </div>

      <Card title={t('settings.general.title')}>
        <SettingRow icon={Globe} title={t('settings.general.language')} description={t('settings.general.language_desc')}>
          <div className="segmented">
            {languageButton('en', 'English')}
            {languageButton('fr', 'Français')}
          </div>
        </SettingRow>
      </Card>

      <div id={AUTO_IMPORT_ANCHOR}>
        <AutoImportCard />
      </div>

      <Card title={t('settings.database.multiple.title')} subtitle={t('settings.database.multiple.desc')}>
        <div className="space-y-4">
          <div className="flex items-center gap-3 py-3 border-b border-dark-200">
            <div className="w-10 h-10 rounded-lg bg-dark-300 flex items-center justify-center"><Plus className="w-5 h-5 text-gray-400" /></div>
            <div className="flex-1">
              <input
                type="text"
                value={newDbName}
                onChange={(e) => setNewDbName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void handleCreateDatabase()}
                placeholder={t('settings.database.multiple.name')}
                className="w-full bg-dark-300 border border-dark-200 rounded-lg px-3 py-2 text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-primary-500"
              />
            </div>
            <button onClick={() => void handleCreateDatabase()} disabled={!newDbName.trim() || creatingDb} className="btn-primary flex items-center gap-2">
              {creatingDb ? <Loader className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {t('settings.database.multiple.create')}
            </button>
          </div>

          {loadingDatabases ? (
            <div className="flex items-center justify-center py-8"><Loader className="w-6 h-6 animate-spin text-gray-400" /></div>
          ) : (
            databases.map((db) => (
              <div key={db.id} className="flex items-center gap-3 py-3 border-b border-dark-200 last:border-b-0">
                <div className="w-10 h-10 rounded-lg bg-dark-300 flex items-center justify-center">
                  <Database className={clsx('w-5 h-5', db.isActive ? 'text-profit-positive' : 'text-gray-400')} />
                </div>
                <div className="flex-1 min-w-0">
                  {editingDbId === db.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        autoFocus
                        value={editingDbName}
                        onChange={(e) => setEditingDbName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void handleRenameDatabase(db)
                          if (e.key === 'Escape') setEditingDbId(null)
                        }}
                        className="flex-1 bg-dark-300 border border-dark-200 rounded-lg px-3 py-1.5 text-gray-100 text-sm focus:outline-none focus:border-primary-500"
                      />
                      <button onClick={() => void handleRenameDatabase(db)} className="p-1.5 text-profit-positive hover:text-green-300"><Check className="w-4 h-4" /></button>
                      <button onClick={() => setEditingDbId(null)} className="p-1.5 text-gray-400 hover:text-gray-300"><X className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-gray-100 font-medium truncate">{db.name}</p>
                        {db.isActive && <span className="badge badge-success text-xs">{t('settings.database.multiple.active')}</span>}
                      </div>
                      <p className="text-sm text-gray-400">{t('settings.database.multiple.created', { date: formatDbDate(db.createdAt) })}</p>
                    </div>
                  )}
                </div>
                {!db.isActive && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setEditingDbId(db.id); setEditingDbName(db.name) }} className="p-2 text-gray-400 hover:text-gray-100 transition-colors" title={t('common.edit')}>
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => void handleSetActiveDatabase(db.id)} className="btn-secondary flex items-center gap-2 text-sm">
                      <Check className="w-4 h-4" />
                      {t('settings.database.multiple.set_active')}
                    </button>
                    <button onClick={() => requestDeleteDatabase(db)} className="p-2 text-profit-negative hover:text-red-300 transition-colors" title={t('common.delete')}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </Card>

      <Card title={t('settings.database.title')} subtitle={t('settings.database.subtitle')}>
        <div className="space-y-4">
          <SettingRow icon={Download} title={t('settings.database.export.title')} description={t('settings.database.export.desc')}>
            <button onClick={() => setExportOpen(true)} className="btn-secondary flex items-center gap-2">
              <Download className="w-4 h-4" />
              {t('settings.database.export.button')}
            </button>
          </SettingRow>
          <SettingRow icon={Trash2} title={t('settings.database.delete.title')} description={t('settings.database.delete.desc')}>
            <button onClick={() => setConfirmDeleteAll(true)} className="btn-danger flex items-center gap-2">
              <Trash2 className="w-4 h-4" />
              {t('settings.database.delete.button')}
            </button>
          </SettingRow>
        </div>
      </Card>

      <Card title={t('settings.server.title')} subtitle={t('settings.server.subtitle')}>
        <SettingRow icon={Database} title={t('settings.server.status.title')} description={t('settings.server.status.desc')}>
          <span className={clsx('badge', serverActive ? 'badge-success' : 'badge-danger')}>
            {serverActive ? t('settings.server.status.active') : t('settings.server.status.inactive')}
          </span>
        </SettingRow>
      </Card>

      <Card title={t('settings.maintenance.title')}>
        <SettingRow icon={FolderOpen} title={t('settings.maintenance.logs.title')} description={t('settings.maintenance.logs.desc')}>
          <button onClick={() => void handleOpenLogs()} className="btn-secondary flex items-center gap-2">
            <FolderOpen className="w-4 h-4" />
            {t('settings.maintenance.logs.button')}
          </button>
        </SettingRow>
      </Card>

      <Card title={t('settings.about.title')}>
        <div className="space-y-4">
          <div className="text-sm text-gray-400">
            <p><span className="text-gray-100">SpinTracker</span> v{appVersion}</p>
            <p>{t('settings.about.description')}</p>
          </div>
          <button onClick={() => void ipcService.checkForUpdates()} className="btn-secondary flex items-center gap-2 text-sm">
            {isChecking ? <Loader className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {isChecking ? t('common.checking') : t('settings.about.check_updates')}
          </button>
        </div>
      </Card>

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
