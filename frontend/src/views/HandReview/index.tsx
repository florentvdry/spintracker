import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { Play, Trash2 } from 'lucide-react'
import Card from '@/components/ui/Card'
import { useFilterStore } from '@/stores/filterStore'
import { useReplayerStore } from '@/stores/replayerStore'
import { useReviewQueueStore, type QueuedHand } from '@/stores/reviewQueueStore'
import { formatCards } from '@/utils/rangeAdherence'

/** The hands marked to review: the one due first is put forward, the rest of the queue listed. */
export default function HandReview() {
  const { t } = useTranslation()
  const heroName = useFilterStore((s) => s.heroName)
  const { items, due, loaded, load, answer, unmark } = useReviewQueueStore()
  const openReplayer = useReplayerStore((s) => s.openSingleHandReplayer)

  useEffect(() => {
    void load(heroName)
  }, [load, heroName])

  const current: QueuedHand | undefined = useMemo(() => items.find((item) => item.dueNow), [items])
  const upcoming = items.filter((item) => item !== current)

  const row = (item: QueuedHand) => (
    <li key={item.handId} className="flex items-center gap-3 border-t border-[#1f242c] py-2 text-[13px]">
      <span className="w-16 font-mono font-bold text-gray-100">{formatCards(item.cards) || '–'}</span>
      <span className="min-w-0 flex-1 truncate text-gray-300">{item.note || item.room}</span>
      <span className="font-mono text-xs text-gray-500">{t('hand_review.box', { box: item.box })}</span>
      <span className={clsx('font-mono text-xs', item.dueNow ? 'text-primary-400' : 'text-gray-500')}>{item.dueNow ? t('hand_review.due_now') : item.dueOn}</span>
      <button className="text-xs text-info hover:underline" onClick={() => void openReplayer(item.handId, heroName)}>
        {t('ranges.adherence.replay')}
      </button>
      <button className="btn-secondary p-1" onClick={() => void unmark(item.handId)} aria-label={t('hand_review.remove')}>
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  )

  return (
    <div className="space-y-4">
      <Card title={t('hand_review.title')} subtitle={t('hand_review.subtitle', { due, total: items.length })}>
        {!loaded ? (
          <div className="spinner mx-auto my-6" />
        ) : items.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500">{t('hand_review.empty')}</p>
        ) : current ? (
          <div className="flex flex-col items-start gap-4">
            <div className="flex items-center gap-4">
              <span className="font-mono text-3xl font-bold text-gray-100">{formatCards(current.cards) || '–'}</span>
              <div className="text-sm text-gray-400">
                <div>{current.note || t('hand_review.no_note')}</div>
                <div className="font-mono text-xs text-gray-500">{current.playedAt}</div>
              </div>
            </div>
            <button className="btn-primary flex items-center gap-2" onClick={() => void openReplayer(current.handId, heroName)}>
              <Play className="h-4 w-4" />
              {t('hand_review.open_replayer')}
            </button>
            <div className="flex gap-2">
              <button className="btn-secondary" onClick={() => void answer(current.handId, true)}>
                {t('hand_review.handled')}
              </button>
              <button className="btn-secondary" onClick={() => void answer(current.handId, false)}>
                {t('hand_review.again')}
              </button>
            </div>
            <p className="text-xs text-gray-500">{t('hand_review.hint')}</p>
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-gray-400">{t('hand_review.nothing_due')}</p>
        )}
      </Card>

      {upcoming.length > 0 && (
        <Card title={t('hand_review.queue')}>
          <ul>{upcoming.map(row)}</ul>
        </Card>
      )}
    </div>
  )
}
