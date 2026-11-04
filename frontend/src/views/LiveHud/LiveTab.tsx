import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { Info, ShieldAlert } from 'lucide-react'
import Card from '@/components/ui/Card'
import { ipcService, type Json } from '@/services/ipcService'
import { useLiveHudStore } from '@/stores/liveHudStore'

const POLL_MS = 2000

const STATE_CLASS: Record<string, string> = {
  shown: 'text-profit-positive',
  hidden: 'text-gray-400',
  waiting: 'text-gray-400',
  toAssociate: 'text-yellow-400',
}

/** The tables the HUD found, refreshed while the tab is open. */
function useTables() {
  const [view, setView] = useState<Json>({ tables: [], candidates: [], tableMode: false, enabled: false })
  const refresh = useCallback(async () => {
    const result = await ipcService.getHudTables()
    if (result.success) setView(result)
  }, [])
  useEffect(() => {
    void refresh()
    const timer = setInterval(() => void refresh(), POLL_MS)
    return () => clearInterval(timer)
  }, [refresh])
  return { view, refresh }
}

function TablesCard() {
  const { t } = useTranslation()
  const { view, refresh } = useTables()
  const tables: Json[] = view.tables ?? []
  const candidates: Json[] = view.candidates ?? []

  const associate = async (table: number, gameId: string) => {
    if (gameId) await ipcService.associateHudTable(table, gameId)
    await refresh()
  }
  const toggleHidden = async (table: Json) => {
    await ipcService.setHudTableHidden(table.id, table.state !== 'hidden')
    await refresh()
  }

  return (
    <Card title={t('liveHud.live.tables')}>
      {view.tableMode && (
        <div className="mb-3 flex gap-3 rounded-lg border border-primary-500/30 bg-primary-500/10 p-3 text-sm text-gray-200">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-primary-400" />
          <p>{t('liveHud.live.table_mode')}</p>
        </div>
      )}
      {tables.length === 0 ? (
        <div className="flex gap-3 rounded-lg bg-dark-200 p-3 text-sm text-gray-400">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{view.enabled ? t('liveHud.live.no_table') : t('liveHud.live.not_enabled')}</p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500">
              <th className="pb-2 font-medium">{t('liveHud.live.col_table')}</th>
              <th className="pb-2 font-medium">{t('liveHud.live.col_room')}</th>
              <th className="pb-2 font-medium">{t('liveHud.live.col_opponents')}</th>
              <th className="pb-2 font-medium">{t('liveHud.live.col_state')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tables.map((table) => (
              <tr key={table.id} className="border-t border-dark-100/40">
                <td className="py-2 pr-2 text-gray-200">{table.title}</td>
                <td className="py-2 pr-2 text-gray-400">{table.room}</td>
                <td className="py-2 pr-2 text-gray-300">
                  {table.state === 'waiting'
                    ? t('liveHud.live.unknown_opponents')
                    : ((table.opponents ?? []) as Json[]).map((p) => p.name).join(', ') || '—'}
                </td>
                <td className={clsx('py-2 pr-2', STATE_CLASS[table.state])}>{t(`liveHud.live.state_${table.state}`)}</td>
                <td className="py-2 text-right">
                  {table.state === 'toAssociate' && (
                    <select
                      defaultValue=""
                      onChange={(e) => void associate(table.id, e.target.value)}
                      className="max-w-[16rem] rounded border border-dark-100 bg-dark-300 px-2 py-1 text-xs text-gray-200"
                    >
                      <option value="">{t('liveHud.live.associate')}</option>
                      {candidates
                        .filter((c) => c.room === table.room)
                        .map((c) => (
                          <option key={c.gameId} value={c.gameId}>
                            {`${c.tournamentName || c.gameId} · ${c.lastHandAt} · ${((c.players ?? []) as Json[]).map((p) => p.name).join(', ')}`}
                          </option>
                        ))}
                    </select>
                  )}
                  {(table.state === 'shown' || table.state === 'hidden') && (
                    <button className="btn-secondary" onClick={() => void toggleHidden(table)}>
                      {table.state === 'hidden' ? t('liveHud.live.show') : t('liveHud.live.hide')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}

export default function LiveTab() {
  const { t } = useTranslation()
  const { settings, setEnabled, setActiveProfile } = useLiveHudStore()

  return (
    <div className="space-y-4">
      <Card title={t('liveHud.live.status')}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-medium text-white">{settings.enabled ? t('liveHud.live.on') : t('liveHud.live.off')}</p>
            <p className="text-sm text-gray-400">{t('liveHud.live.rooms_all')}</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={settings.enabled} onChange={(e) => setEnabled(e.target.checked)} />
            {t('liveHud.live.pause_switch')}
          </label>
        </div>
      </Card>

      <Card title={t('liveHud.live.active_profile')}>
        <div className="flex flex-wrap gap-2">
          {settings.profiles.map((p) => (
            <button
              key={p.id}
              onClick={() => setActiveProfile(p.id)}
              className={
                p.id === settings.activeProfileId
                  ? 'rounded-md border border-primary-500 bg-primary-500 px-3 py-1.5 text-sm text-white'
                  : 'rounded-md border border-dark-100 px-3 py-1.5 text-sm text-gray-300'
              }
            >
              {p.name}
            </button>
          ))}
        </div>
      </Card>

      <TablesCard />
    </div>
  )
}
