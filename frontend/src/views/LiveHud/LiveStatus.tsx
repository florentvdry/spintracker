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

/** The HUD switch and, on demand, the tables it found: one line above the editor. */
export default function LiveStatus() {
  const { t } = useTranslation()
  const { settings, setEnabled } = useLiveHudStore()
  const { view } = useTables()
  const [open, setOpen] = useState(false)
  const count = (view.tables ?? []).filter((table: Json) => table.state === 'shown').length

  return (
    <div className="space-y-3">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <label className="flex items-center gap-3 text-sm text-gray-200">
            <input type="checkbox" checked={settings.enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <span className="font-medium text-white">{settings.enabled ? t('liveHud.live.on') : t('liveHud.live.off')}</span>
            <span className="text-gray-400">{settings.enabled ? t('liveHud.live.tables_shown', { count }) : t('liveHud.live.pause_switch')}</span>
          </label>
          <button className="text-xs text-gray-400 hover:text-gray-200" onClick={() => setOpen((o) => !o)}>
            {open ? t('liveHud.live.hide_tables') : t('liveHud.live.show_tables')}
          </button>
        </div>
      </Card>
      {open && <TablesCard />}
    </div>
  )
}
