import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import Card from '@/components/ui/Card'
import LoadingOverlay from '@/components/ui/LoadingOverlay'
import type { BadBeatMode, BadBeatSettings, CevBreakdown } from '@/hooks/useCevBreakdown'

const MAX_FOLLOWING = 50
const MIN_EQUITY_FLOOR = 50
const MIN_EQUITY_CEILING = 99

const perTournament = (ev: number, tournaments: number) => (tournaments > 0 ? ev / tournaments : 0)
const signed = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(1)}`
const tone = (value: number) => (value >= 0 ? 'text-profit-positive' : 'text-profit-negative')

interface Props {
  data: CevBreakdown | null
  isLoading: boolean
  badBeat: BadBeatSettings
  onBadBeatChange: (settings: BadBeatSettings) => void
}

function Row({ label, tournaments, avg }: { label: string; tournaments: number; avg: number }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-[13px]">
      <span className="text-gray-100">{label}</span>
      <span className="flex items-baseline gap-3">
        <span className="font-mono text-xs text-gray-500">n = {tournaments}</span>
        <span className={clsx('w-16 text-right font-mono font-medium', tone(avg))}>{signed(avg)}</span>
      </span>
    </div>
  )
}

/** CEV per tournament by multiplier, by rank in the session and after a bad beat. */
export default function CevBreakdownCard({ data, isLoading, badBeat, onBadBeatChange }: Props) {
  const { t } = useTranslation()
  const progressLabel = (from: number, to: number | null) => (to === null ? `${from}+` : `${from}-${to}`)
  const after = data?.after_bad_beat

  return (
    <Card title={t('cev_breakdown.title')} subtitle={t('cev_breakdown.subtitle')}>
      <LoadingOverlay loading={isLoading}>
        {!data ? (
          <p className="py-6 text-center text-sm text-gray-500">{t('common.no_data')}</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <section>
              <h3 className="mb-1 text-[11px] uppercase tracking-[.06em] text-gray-500">{t('cev_breakdown.by_multiplier')}</h3>
              {data.by_multiplier.map((row) => (
                <Row key={row.multiplier} label={`x${row.multiplier}`} tournaments={row.tournaments} avg={perTournament(row.ev, row.tournaments)} />
              ))}
            </section>
            <section>
              <h3 className="mb-1 text-[11px] uppercase tracking-[.06em] text-gray-500">{t('cev_breakdown.by_session_progress')}</h3>
              {data.by_session_progress
                .filter((row) => row.tournaments > 0)
                .map((row) => (
                  <Row key={row.from} label={progressLabel(row.from, row.to)} tournaments={row.tournaments} avg={perTournament(row.ev, row.tournaments)} />
                ))}
            </section>
            <section>
              <h3 className="mb-1 text-[11px] uppercase tracking-[.06em] text-gray-500">{t('cev_breakdown.after_bad_beat')}</h3>
              <div className="mb-2 grid grid-cols-2 gap-2 text-xs text-gray-400">
                <label className="flex flex-col gap-1">
                  {t('cev_breakdown.following')}
                  <input
                    type="number"
                    min={1}
                    max={MAX_FOLLOWING}
                    className="input font-mono"
                    value={badBeat.following}
                    onChange={(e) => onBadBeatChange({ ...badBeat, following: Math.min(MAX_FOLLOWING, Math.max(1, Number(e.target.value) || 1)) })}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  {t('cev_breakdown.min_equity')}
                  <input
                    type="number"
                    min={MIN_EQUITY_FLOOR}
                    max={MIN_EQUITY_CEILING}
                    className="input font-mono"
                    value={badBeat.minEquityPercent}
                    onChange={(e) =>
                      onBadBeatChange({ ...badBeat, minEquityPercent: Math.min(MIN_EQUITY_CEILING, Math.max(MIN_EQUITY_FLOOR, Number(e.target.value) || MIN_EQUITY_FLOOR)) })
                    }
                  />
                </label>
                <label className="col-span-2 flex flex-col gap-1">
                  {t('cev_breakdown.definition')}
                  <select className="select" value={badBeat.mode} onChange={(e) => onBadBeatChange({ ...badBeat, mode: e.target.value as BadBeatMode })}>
                    <option value="elimination">{t('cev_breakdown.mode_elimination')}</option>
                    <option value="big_pot">{t('cev_breakdown.mode_big_pot')}</option>
                  </select>
                </label>
              </div>
              {after && after.bad_beats > 0 ? (
                <>
                  <p className="py-1 text-[13px] text-gray-400">{t('cev_breakdown.bad_beats', { count: after.bad_beats })}</p>
                  <Row label={t('cev_breakdown.next_tournaments', { count: badBeat.following })} tournaments={after.tournaments_after} avg={after.avg_after} />
                  <Row label={t('cev_breakdown.all_tournaments')} tournaments={data.by_multiplier.reduce((n, m) => n + m.tournaments, 0)} avg={after.avg_all} />
                </>
              ) : (
                <p className="text-xs text-gray-500">{t('cev_breakdown.no_bad_beat')}</p>
              )}
            </section>
          </div>
        )}
      </LoadingOverlay>
    </Card>
  )
}
