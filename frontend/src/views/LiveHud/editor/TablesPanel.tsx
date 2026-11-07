import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ipcService, type Json } from '@/services/ipcService'

const POLL_MS = 2000

const STATE_CLASS: Record<string, string> = {
  shown: 'text-profit-positive',
  hidden: 'text-gray-400',
  waiting: 'text-gray-400',
  toAssociate: 'text-primary-400',
}

export interface TablesState {
  view: Json
  refresh: () => Promise<void>
}

/** The tables the HUD found, refreshed every few seconds. */
export function useTables(): TablesState {
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

/** Tables the HUD found, with what to do about each one. */
export default function TablesPanel({ view, refresh }: TablesState) {
  const { t } = useTranslation()
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
    <div className="w-[560px] max-w-[calc(100vw-48px)] overflow-hidden rounded-lg border border-dark-100 bg-dark-300 shadow-xl shadow-black/50">
      <h2 className="border-b border-dark-100 px-3 py-2.5 text-[13px] font-semibold text-gray-100">{t('liveHud.live.tables')}</h2>
      {tables.length === 0 && <p className="px-3 py-3 text-xs text-gray-400">{view.enabled ? t('liveHud.live.no_table') : t('liveHud.live.not_enabled')}</p>}
      {tables.length > 0 && <p className="border-b border-dark-200 px-3 py-2 text-xs text-gray-400">{t('liveHud.live.read_limit')}</p>}
      {tables.map((table) => (
        <div key={table.id} className="flex flex-wrap items-center gap-2.5 border-b border-dark-200 px-3 py-2">
          <div className="min-w-0 flex-1 basis-48">
            <div className="truncate font-medium text-gray-100">{table.title}</div>
            <div className="truncate text-xs text-gray-400">
              {table.room}
              {' · '}
              {table.state === 'waiting' ? t('liveHud.live.unknown_opponents') : ((table.opponents ?? []) as Json[]).map((p) => p.name).join(', ') || '—'}
            </div>
          </div>
          <span className={`text-xs ${STATE_CLASS[table.state] ?? 'text-gray-400'}`}>{t(`liveHud.live.state_${table.state}`)}</span>
          {table.state === 'toAssociate' && (
            <select
              defaultValue=""
              onChange={(e) => void associate(table.id, e.target.value)}
              className="max-w-[14rem] rounded border border-dark-100 bg-dark-200 px-2 py-1 text-xs text-gray-200"
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
            <button type="button" className="rounded border border-dark-100 bg-dark-200 px-2 py-1 text-xs text-gray-200 hover:border-gray-500" onClick={() => void toggleHidden(table)}>
              {table.state === 'hidden' ? t('liveHud.live.show') : t('liveHud.live.hide')}
            </button>
          )}
        </div>
      ))}
      <p className="px-3 py-2 text-[11px] text-gray-400">{t('liveHud.live.table_mode')}</p>
    </div>
  )
}
