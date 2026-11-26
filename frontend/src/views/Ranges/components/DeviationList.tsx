import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import DeviationBadge from '@/components/ranges/DeviationBadge'
import Modal from '@/components/ui/Modal'
import { ipcService } from '@/services/ipcService'
import { useFilterStore, getDateRangeParams } from '@/stores/filterStore'
import { useReplayerStore } from '@/stores/replayerStore'
import { deviationRows, formatCards, type DeviationEntry, type DeviationRow, type ScenarioDetail } from '@/utils/rangeAdherence'
import { logError } from '@/utils/log'
import type { RangeAction } from '@/utils/ranges'

const MAX_ROWS = 40
/** Colour of a played action the player has no action for. */
const UNKNOWN_ACTION_COLOR = '#8b93a1'

interface Props {
  detail: ScenarioDetail
  actions: RangeAction[]
  heroName: string
}

/** Deviations of the scenario by hand: planned -> played and how many times; a click opens the hands. */
export default function DeviationList({ detail, actions, heroName }: Props) {
  const { t } = useTranslation()
  const rows = useMemo(() => deviationRows(detail).slice(0, MAX_ROWS), [detail])
  const byId = useMemo(() => new Map(actions.map((a) => [a.id, a])), [actions])
  const [open, setOpen] = useState<DeviationRow | null>(null)
  const [hands, setHands] = useState<DeviationEntry[] | null>(null)
  const openReplayer = useReplayerStore((s) => s.openSingleHandReplayer)
  const filters = useFilterStore()

  useEffect(() => {
    if (!open) return undefined
    let cancelled = false
    setHands(null)
    const { dateFrom, dateTo } = getDateRangeParams(filters)
    void (async () => {
      try {
        const result = await ipcService.getRangeDeviationHands(detail.scenarioId, {
          heroName, handClass: open.hand, played: open.playedImmediate, response: open.playedResponse ?? '', from: dateFrom, to: dateTo,
        })
        if (!cancelled) setHands(result.success ? (result.data as DeviationEntry[]) : [])
      } catch (error) {
        logError('Failed to load the deviation hands:', error)
        if (!cancelled) setHands([])
      }
    })()
    return () => {
      cancelled = true
    }
    // The filters are read once when a line opens; reopening reads them again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, detail.scenarioId, heroName])

  const chipOf = (id: number | null, immediate: string) => (id === null ? { label: t(`ranges.immediate.${immediate}`), color: UNKNOWN_ACTION_COLOR } : (byId.get(id) ?? { label: '?', color: UNKNOWN_ACTION_COLOR }))

  if (rows.length === 0) return <p className="text-sm text-gray-400">{t('ranges.adherence.noDeviation')}</p>
  return (
    <>
      <ul className="flex flex-col gap-1.5">
        {rows.map((row) => {
          const planned = byId.get(row.plannedActionId)
          const played = chipOf(row.playedActionId, row.playedImmediate)
          const suffix = row.kind === 'response' && row.playedResponse ? ` · ${t(`ranges.responses.${row.playedResponse}`)}` : ''
          return (
            <li key={`${row.hand}-${row.playedImmediate}-${row.playedResponse ?? ''}-${row.kind ?? ''}`}>
              <button
                className="flex w-full items-center gap-3 rounded-lg border border-dark-200 bg-dark-600 px-3 py-2 text-left text-[13px] hover:border-deviation"
                onClick={() => setOpen(row)}
              >
                <span className="w-10 font-mono font-bold text-gray-100">{row.hand}</span>
                <span className="min-w-0 flex-1 truncate text-gray-300">
                  <span className="font-semibold" style={{ color: planned?.color }}>{planned?.label ?? '?'}</span>
                  {' → '}
                  <span className="font-semibold text-deviation">{played.label}{suffix}</span>
                </span>
                <span className="font-mono text-xs text-gray-400">{t('ranges.adherence.handsCount', { count: row.count })}</span>
              </button>
            </li>
          )
        })}
      </ul>

      <Modal open={open !== null} title={open ? `${open.hand} · ${byId.get(open.plannedActionId)?.label ?? '?'} → ${chipOf(open.playedActionId, open.playedImmediate).label}` : ''} onClose={() => setOpen(null)} width={520}>
        {hands === null ? (
          <div className="spinner mx-auto my-6" />
        ) : (
          <ul className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
            {hands.map((entry) => (
              <li key={entry.handId} className="rounded-lg border border-dark-200 bg-dark-600 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-[15px] font-bold text-gray-100">{formatCards(entry.cards) || entry.handClass}</span>
                  <span className="text-xs text-gray-500">{entry.playedAt ? new Date(entry.playedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : ''}</span>
                  <button className="ml-auto text-xs text-info hover:underline" onClick={() => void openReplayer(entry.handId, heroName)}>
                    {t('ranges.adherence.replay')}
                  </button>
                </div>
                <div className="mt-2">
                  <DeviationBadge expected={entry.expectedActionId === null ? null : (byId.get(entry.expectedActionId) ?? null)} played={chipOf(entry.playedActionId, entry.playedImmediate)} response={null} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  )
}
