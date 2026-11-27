import { Plus, Download, Edit2, Trash2, Loader, Check, X, Database } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import Card from '@/components/ui/Card'
import SettingRow from '@/views/Settings/components/SettingRow'
import AutoImportCard from '@/views/Settings/components/AutoImportCard'
import { type Json } from '@/services/ipcService'
import { AUTO_IMPORT_ANCHOR } from '@/views/Settings/anchors'

interface DatabasePageProps {
  databases: Json[]
  loadingDatabases: boolean
  newDbName: string
  setNewDbName: (value: string) => void
  creatingDb: boolean
  editingDbId: string | number | null
  editingDbName: string
  setEditingDbId: (id: string | number | null) => void
  setEditingDbName: (value: string) => void
  handleCreateDatabase: () => Promise<void>
  handleSetActiveDatabase: (id: string | number) => Promise<void>
  handleRenameDatabase: (db: Json) => Promise<void>
  handleDeleteAll: () => Promise<void>
  requestDeleteDatabase: (db: Json) => void
  setExportOpen: (open: boolean) => void
  formatDbDate: (dateStr: string | null | undefined) => string
}

export default function DatabasePage({
  databases,
  loadingDatabases,
  newDbName,
  setNewDbName,
  creatingDb,
  editingDbId,
  editingDbName,
  setEditingDbId,
  setEditingDbName,
  handleCreateDatabase,
  handleSetActiveDatabase,
  handleRenameDatabase,
  handleDeleteAll,
  requestDeleteDatabase,
  setExportOpen,
  formatDbDate,
}: DatabasePageProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      <div id={AUTO_IMPORT_ANCHOR}>
        <AutoImportCard />
      </div>

      <Card title={t('settings.database.multiple.title')} subtitle={t('settings.database.multiple.desc')}>
        <div className="space-y-4">
          <div className="flex items-center gap-3 py-3 border-b border-dark-200">
            <div className="w-10 h-10 rounded-lg bg-dark-300 flex items-center justify-center">
              <Plus className="w-5 h-5 text-gray-400" />
            </div>
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
            <button
              onClick={() => void handleCreateDatabase()}
              disabled={!newDbName.trim() || creatingDb}
              className="btn-primary flex items-center gap-2"
            >
              {creatingDb ? <Loader className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {t('settings.database.multiple.create')}
            </button>
          </div>

          {loadingDatabases ? (
            <div className="flex items-center justify-center py-8">
              <Loader className="w-6 h-6 animate-spin text-gray-400" />
            </div>
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
                      <button
                        onClick={() => void handleRenameDatabase(db)}
                        className="p-1.5 text-profit-positive hover:text-green-300"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => setEditingDbId(null)} className="p-1.5 text-gray-400 hover:text-gray-300">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-gray-100 font-medium truncate">{db.name}</p>
                        {db.isActive && <span className="badge badge-success text-xs">{t('settings.database.multiple.active')}</span>}
                      </div>
                      <p className="text-sm text-gray-400">
                        {t('settings.database.multiple.created', { date: formatDbDate(db.createdAt) })}
                      </p>
                    </div>
                  )}
                </div>
                {!db.isActive && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setEditingDbId(db.id)
                        setEditingDbName(db.name)
                      }}
                      className="p-2 text-gray-400 hover:text-gray-100 transition-colors"
                      title={t('common.edit')}
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => void handleSetActiveDatabase(db.id)}
                      className="btn-secondary flex items-center gap-2 text-sm"
                    >
                      <Check className="w-4 h-4" />
                      {t('settings.database.multiple.set_active')}
                    </button>
                    <button
                      onClick={() => requestDeleteDatabase(db)}
                      className="p-2 text-profit-negative hover:text-red-300 transition-colors"
                      title={t('common.delete')}
                    >
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
            <button onClick={() => void handleDeleteAll()} className="btn-danger flex items-center gap-2">
              <Trash2 className="w-4 h-4" />
              {t('settings.database.delete.button')}
            </button>
          </SettingRow>
        </div>
      </Card>
    </div>
  )
}
