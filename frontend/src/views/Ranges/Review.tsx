import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { useFilterStore } from '@/stores/filterStore'
import { useReviewStore } from '@/stores/reviewStore'
import { useTrainingStore } from '@/stores/trainingStore'
import { useUserRangesStore } from '@/stores/userRangesStore'
import { formatDepth, formatNumber } from '@/utils/ranges'
import { BOX_COLORS, BOX_INTERVAL_DAYS, boxBarWidth, cardsToday, DUE_WARNING_THRESHOLD, lastSessionDay, masteredShare, scenariosOf } from '@/utils/review'

interface ReviewProps {
  /** Opens the quiz on the source just chosen. */
  onStart: () => void
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="card p-[22px]">
      <div className="text-[13px] text-gray-400">{label}</div>
      <div className="font-mono text-[28px] font-bold leading-tight text-gray-100 my-1">{value}</div>
      <div className="text-xs text-gray-500">{hint}</div>
    </div>
  )
}

export default function Review({ onStart }: ReviewProps) {
  const { t, i18n } = useTranslation()
  const heroName = useFilterStore((s) => s.heroName)
  const { overview, loading, load } = useReviewStore()
  const programs = useUserRangesStore((s) => s.programs)
  const setSource = useTrainingStore((s) => s.setSource)
  const [programId, setProgramId] = useState<number | null>(null)

  useEffect(() => {
    void load(heroName)
  }, [load, heroName])

  if (!overview) return <div className="spinner mx-auto mt-24" />

  const num = (value: number, digits = 0) => formatNumber(value, i18n.language, digits)
  const program = programs.find((p) => p.id === programId)
  const rows = scenariosOf(overview, program ? program.spotIds : null).filter((s) => s.cards > 0 || s.dueToday > 0)
  const waiting = cardsToday(overview)
  const success = overview.success7.rate

  const start = (source: 'review' | 'deviation' | 'missed') => {
    setSource(source)
    onStart()
  }

  return (
    <div className={clsx('flex flex-col gap-[18px]', loading && 'opacity-70 transition-opacity')} aria-busy={loading}>
      <div className="grid gap-[18px] lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <section className="rounded-[14px] border border-primary-500 bg-primary-500/[0.06] p-[22px]">
          <div className="text-[13px] text-gray-400">{t('ranges.review.today')}</div>
          <div className="flex items-baseline gap-3 my-1">
            <span className="font-mono text-4xl font-bold text-gray-100">{num(overview.today.due)}</span>
            <span className="text-sm text-gray-100">{t('ranges.review.cardsToReview')}</span>
          </div>
          <div className="text-xs text-gray-400">{t('ranges.review.newAndTime', { count: overview.today.newAvailable, minutes: overview.today.minutes })}</div>
          <div className="flex flex-wrap gap-2 mt-4">
            <button className="btn-primary" disabled={waiting === 0} onClick={() => start('review')}>
              {t('ranges.review.start')}
            </button>
            <button className="btn-secondary" disabled={overview.newDeviations === 0} onClick={() => start('deviation')}>
              {t('ranges.review.realDeviations', { count: overview.newDeviations })}
            </button>
          </div>
        </section>
        <Stat label={t('ranges.review.success7')} value={success === null ? '–' : `${num(success * 100)} %`} hint={t('ranges.review.answers', { count: overview.success7.answers })} />
        <Stat label={t('ranges.review.mastered')} value={`${num(overview.mastered.count)} / ${num(overview.mastered.total)}`} hint={t('ranges.review.masteredHint')} />
      </div>

      <section className="card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <h3 className="text-[15px] font-semibold text-gray-100">{t('ranges.review.byBox')}</h3>
          <span className="text-xs text-gray-400">{t('ranges.review.boxHelp')}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-5">
          {overview.boxes.map((count, index) => (
            <div key={index} className="rounded-lg border border-dark-200 bg-dark-600 p-3">
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] font-semibold text-gray-100">{t('ranges.review.box', { number: index + 1 })}</span>
                <span className="text-xs text-gray-500">{t(`ranges.review.interval.${BOX_INTERVAL_DAYS[index]}`)}</span>
              </div>
              <div className="font-mono text-[26px] font-bold text-gray-100 my-1">{num(count)}</div>
              <div className="h-1.5 rounded-full bg-dark-300" role="img" aria-label={t('ranges.review.boxBar', { number: index + 1, count })}>
                <div className="h-full rounded-full" style={{ width: `${boxBarWidth(count, overview.boxes)}%`, backgroundColor: BOX_COLORS[index] }} />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-gray-500">{t('ranges.review.newCardsNote')}</p>
      </section>

      <div className="grid gap-[18px] lg:grid-cols-2">
        <section className="card p-5">
          <h3 className="text-[15px] font-semibold text-gray-100 mb-3">{t('ranges.review.byProgram')}</h3>
          {overview.programs.length === 0 ? (
            <p className="text-sm text-gray-400">{t('ranges.review.noProgram')}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {overview.programs.map((p) => (
                <li key={p.id}>
                  <button className="flex w-full items-center gap-3 text-left" aria-pressed={programId === p.id} onClick={() => setProgramId(programId === p.id ? null : p.id)}>
                    <span className="w-36 shrink-0">
                      <span className={clsx('block text-[13px] font-semibold', programId === p.id ? 'text-primary-400' : 'text-gray-100')}>{p.name}</span>
                      <span className="block text-xs text-gray-500">{t('ranges.review.scenarios', { count: p.scenarios })}</span>
                    </span>
                    <span className="h-2 flex-1 rounded-full bg-dark-300">
                      <span className="block h-full rounded-full bg-primary-500" style={{ width: `${masteredShare(p.mastered, p.cards)}%` }} />
                    </span>
                    <span className="w-12 text-right font-mono text-xs text-gray-100">{masteredShare(p.mastered, p.cards)} %</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-5">
          <h3 className="text-[15px] font-semibold text-gray-100 mb-3">{t('ranges.review.hardest')}</h3>
          {overview.hardest.length === 0 ? (
            <p className="text-sm text-gray-400">{t('ranges.review.noMisses')}</p>
          ) : (
            <ul className="divide-y divide-dark-200">
              {overview.hardest.map((hand) => (
                <li key={`${hand.scenarioId}-${hand.handClass}`} className="flex items-center gap-3 py-2">
                  <span className="w-14 font-mono text-[15px] font-bold text-gray-100">{hand.handClass}</span>
                  <span className="flex-1 truncate text-xs text-gray-400">{hand.name} · {formatDepth(hand.stackBb)} bb</span>
                  <span className="font-mono text-xs text-profit-negative">{t('ranges.review.missedOf', { missed: hand.missed, attempts: hand.attempts })}</span>
                </li>
              ))}
            </ul>
          )}
          <button className="btn-secondary mt-3 w-full" disabled={overview.hardest.length === 0} onClick={() => start('missed')}>
            {t('ranges.review.quizOnThese')}
          </button>
        </section>
      </div>

      <section className="card p-0 overflow-hidden">
        <div className="px-5 py-3 text-[15px] font-semibold text-gray-100">{t('ranges.review.byScenario', { program: program?.name ?? t('ranges.review.allRanges') })}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="text-xs text-gray-400">
              <tr>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">{t('ranges.adherence.columns.scenario')}</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">{t('ranges.review.columns.cards')}</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">{t('ranges.review.columns.mastered')}</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">{t('ranges.review.columns.due')}</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">{t('ranges.review.columns.last')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const last = lastSessionDay(row.lastSession)
                return (
                  <tr key={row.scenarioId} className="border-t border-dark-200">
                    <td className="px-4 py-2.5 font-semibold text-gray-100">{row.name} · {formatDepth(row.stackBb)} bb</td>
                    <td className="px-4 py-2.5 text-right font-mono text-gray-100">{num(row.cards)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-gray-100">{masteredShare(row.mastered, row.cards)} %</td>
                    <td className={clsx('px-4 py-2.5 text-right font-mono', row.dueToday > DUE_WARNING_THRESHOLD ? 'text-deviation' : 'text-gray-100')}>{num(row.dueToday)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-400">{last ? new Date(last).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' }) : '–'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
