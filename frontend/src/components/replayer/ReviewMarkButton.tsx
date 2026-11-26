import { useEffect } from 'react'
import { Bookmark } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { useKeyShortcut } from '@/hooks/useKeyShortcut'
import { useReviewQueueStore } from '@/stores/reviewQueueStore'

/** Marks the hand on the table for review (or takes the mark off): the same as the `m` key. */
export default function ReviewMarkButton({ handId, heroName }: { handId: string; heroName: string | null }) {
  const { t } = useTranslation()
  const marked = useReviewQueueStore((s) => s.markedIds.has(handId))
  const { load, mark, unmark } = useReviewQueueStore.getState()

  useEffect(() => {
    void load(heroName)
  }, [load, heroName, handId])

  const toggle = () => void (marked ? unmark(handId) : mark(handId))
  useKeyShortcut('m', toggle)

  return (
    <button className={clsx('log-toggle', marked && 'active')} aria-pressed={marked} onClick={toggle} title={t('hand_review.mark_hint')}>
      <Bookmark size={18} />
      <span>{marked ? t('hand_review.marked') : t('hand_review.mark')}</span>
    </button>
  )
}
