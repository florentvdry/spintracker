import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { formatNumber } from '@/utils/ranges'
import { isLimp, seatLabel, type QuizQuestion, type QuizSeat } from '@/utils/training'

const SUIT_SYMBOLS: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' }

function CardFace({ card }: { card: string }) {
  const suit = card.slice(-1).toLowerCase()
  const red = suit === 'h' || suit === 'd'
  return (
    <div className={clsx('w-[46px] h-16 rounded-md bg-gray-100 flex flex-col items-center justify-center font-mono font-bold leading-none', red ? 'text-profit-negative' : 'text-dark-500')} aria-label={card}>
      <span className="text-lg">{card[0] === 'T' ? '10' : card[0]}</span>
      <span className="text-xl">{SUIT_SYMBOLS[suit] ?? ''}</span>
    </div>
  )
}

function OpponentSeat({ seat, question, language }: { seat: QuizSeat; question: QuizQuestion; language: string }) {
  const { t } = useTranslation()
  const folded = seat.action === 'fold'
  const pill = (() => {
    if (!seat.action) return null
    const size = `${formatNumber(seat.betBb, language, Number.isInteger(seat.betBb) ? 0 : 1)} bb`
    if (seat.action === 'fold') return t('ranges.training.table.fold')
    if (seat.action === 'call') return `${isLimp(question.table.seats, seat) ? t('ranges.training.table.limp') : t('ranges.training.table.call')} ${size}`
    if (seat.action === 'raise') return `${t('ranges.training.table.raise')} ${size}`
    return `${t('ranges.training.table.allin')} ${size}`
  })()
  return (
    <div className={clsx('w-[200px] rounded-lg border border-dark-100 bg-dark-400 p-2.5', folded && 'opacity-60')}>
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="font-semibold text-gray-100">{seatLabel(seat.position, question.opponent, false)}</span>
        <span className="font-mono text-gray-400">{formatNumber(seat.stackBb, language, 1)} bb</span>
      </div>
      {pill && <span className={clsx('mt-1.5 inline-block rounded-full px-2 py-0.5 text-xs font-medium', folded ? 'bg-dark-300 text-gray-400' : 'bg-info/20 text-info')}>{pill}</span>}
    </div>
  )
}

/** The table of a quiz question: the opponents' actions, the pot and the hero's cards. */
export default function QuizTable({ question }: { question: QuizQuestion }) {
  const { t, i18n } = useTranslation()
  const opponents = question.table.seats.filter((s) => !s.isHero)
  const hero = question.table.seats.find((s) => s.isHero)
  return (
    <div className="relative h-[430px] w-full overflow-hidden" role="img" aria-label={t('ranges.training.table.label', { name: question.name })}>
      <div className="absolute inset-x-[4%] top-[18%] bottom-[18%] rounded-[999px] border-[10px] border-dark-300 bg-felt flex flex-col items-center justify-center">
        <span className="text-xs text-gray-400">{t('ranges.training.table.pot')}</span>
        <span className="font-mono text-[22px] font-bold text-gray-100">{formatNumber(question.table.potBb, i18n.language, Number.isInteger(question.table.potBb) ? 0 : 1)} bb</span>
      </div>
      {opponents[0] && (
        <div className="absolute left-[2%] top-[3%]">
          <OpponentSeat seat={opponents[0]} question={question} language={i18n.language} />
        </div>
      )}
      {opponents[1] && (
        <div className="absolute right-[2%] top-[3%]">
          <OpponentSeat seat={opponents[1]} question={question} language={i18n.language} />
        </div>
      )}
      {hero && (
        <div className="absolute bottom-[2%] left-1/2 -translate-x-1/2 w-[240px] rounded-lg border-2 border-primary-500 bg-dark-400 p-2.5">
          <div className="flex items-baseline justify-between text-[13px]">
            <span className="font-semibold text-gray-100">{t('ranges.training.table.you')} · {hero.position}</span>
            <span className="font-mono text-gray-400">{formatNumber(hero.stackBb, i18n.language, 1)} bb</span>
          </div>
          <div className="mt-2 flex justify-center gap-2">
            <CardFace card={question.cards[0]} />
            <CardFace card={question.cards[1]} />
          </div>
        </div>
      )}
    </div>
  )
}
