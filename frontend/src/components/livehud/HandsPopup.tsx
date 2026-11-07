import clsx from 'clsx'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import CardTile from '@/components/common/CardTile'
import { actionLabel, formatBb, type FigureHand, type FigureHands, type HandsOf, type HandStreet } from '@/views/LiveHud/figureHands'

/** The list of hands behind a stat, in the table HUD: one block per hand, a line per street. */

export type HandsPopupState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: FigureHands }

export interface HandsPopupProps {
  /** The stat, as it is named on the HUD. */
  title: string
  player: string
  which: HandsOf
  onWhich: (which: HandsOf) => void
  state: HandsPopupState
  onClose: () => void
}

const OWN_COLOR = 'text-[#62e08a]'
const OPPONENT_COLOR = 'text-[#7fb0ff]'

function ResultPill({ value }: { value: number | null }) {
  const { t } = useTranslation()
  if (value === null) return null
  const tone = value > 0 ? 'bg-[#123a24] text-[#62e08a]' : value < 0 ? 'bg-[#3a1616] text-[#ff7a7a]' : 'bg-[#232937] text-[#aeb6c4]'
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return <span className={clsx('ml-auto rounded-full px-2 py-0.5 text-[13px] font-bold', tone)}>{t('liveHud.hands.bb', { value: `${sign}${formatBb(Math.abs(value))}` })}</span>
}

function StreetLine({ street }: { street: HandStreet }) {
  const { t } = useTranslation()
  return (
    <>
      <div className="text-[11px] uppercase text-[#8a93a5]">{t(`liveHud.hands.street_${street.street}`)}</div>
      <div className="flex flex-wrap items-center gap-x-[5px] gap-y-1 font-semibold">
        {street.cards.length > 0 && (
          <span className="flex items-center gap-[3px]">
            {street.cards.map((card) => (
              <CardTile key={card} card={card} size="xs" />
            ))}
          </span>
        )}
        {street.potBb !== null && <span className="mx-1 text-xs font-normal text-[#8a93a5]">{t('liveHud.hands.pot', { value: formatBb(street.potBb) })}</span>}
        {street.actions.map((action, i) => (
          // The same action can follow itself (two checks): the rank in the street is the identity.
          <span key={`${i}:${action.kind}`} className={action.own ? OWN_COLOR : OPPONENT_COLOR}>
            {actionLabel(action)}
          </span>
        ))}
      </div>
    </>
  )
}

function HandBlock({ hand, dimmed }: { hand: FigureHand; dimmed: boolean }) {
  const { t } = useTranslation()
  return (
    <div className={clsx('border-b border-[#232937] px-3.5 py-3', dimmed && 'opacity-55')} title={hand.playedAt}>
      <div className="mb-2 flex items-center gap-2.5">
        <span className="flex items-center">
          {hand.cards.length > 0 ? (
            hand.cards.map((card, i) => (
              <span key={card} className={i > 0 ? '-ml-1.5' : undefined}>
                <CardTile card={card} />
              </span>
            ))
          ) : (
            <span className="text-xs text-[#8a93a5]">{t('liveHud.hands.hidden_cards')}</span>
          )}
        </span>
        {hand.stackBb !== null && <span className="text-[13px] text-[#aeb6c4]">{t('liveHud.hands.bb', { value: formatBb(hand.stackBb) })}</span>}
        <ResultPill value={hand.resultBb} />
      </div>
      <div className="grid grid-cols-[54px_1fr] items-center gap-y-[5px] text-sm">
        {hand.streets.map((street) => (
          <StreetLine key={street.street} street={street} />
        ))}
      </div>
    </div>
  )
}

function Body({ state, which }: { state: HandsPopupState; which: HandsOf }) {
  const { t } = useTranslation()
  if (state.status === 'loading') return <div className="px-3.5 py-6 text-center text-sm text-[#aeb6c4]">{t('liveHud.hands.loading')}</div>
  if (state.status === 'error') return <div className="px-3.5 py-6 text-center text-sm text-[#ff9a7a]">{t('liveHud.hands.error')}</div>
  if (state.data.hands.length === 0) return <div className="px-3.5 py-6 text-center text-sm text-[#aeb6c4]">{t('liveHud.hands.empty')}</div>
  return (
    <>
      {state.data.hands.map((hand) => (
        <HandBlock key={hand.id} hand={hand} dimmed={which === 'chances' && !hand.done} />
      ))}
    </>
  )
}

export default function HandsPopup({ title, player, which, onWhich, state, onClose }: HandsPopupProps) {
  const { t } = useTranslation()
  const data = state.status === 'ready' ? state.data : null
  const count = data ? (data.total > data.hands.length ? t('liveHud.hands.count_latest', { shown: data.hands.length, total: data.total }) : t('liveHud.hands.count_all', { total: data.total })) : ''
  const choices: HandsOf[] = ['done', 'chances']
  return (
    <div className="flex max-h-[inherit] w-[504px] max-w-full flex-col overflow-hidden rounded-lg border border-[#2f3646] bg-[#171b24] text-[#e6e9ef] shadow-[0_12px_32px_rgba(0,0,0,0.55)]">
      <div className="flex shrink-0 items-center gap-2.5 border-b border-[#2f3646] px-3.5 py-3">
        <div className="min-w-0 truncate text-[15px] font-bold">
          {title} <span className="font-normal text-[#aeb6c4]">· {player}</span>
        </div>
        <div className="shrink-0 text-xs text-[#aeb6c4]">{count}</div>
        <div className="ml-auto flex shrink-0 overflow-hidden rounded-md border border-[#2f3646] text-xs" role="group" aria-label={t('liveHud.hands.which')}>
          {choices.map((choice) => (
            <button
              key={choice}
              type="button"
              aria-pressed={which === choice}
              className={clsx('px-2.5 py-1', which === choice ? 'bg-[#2d5cba] font-semibold text-gray-100' : 'text-[#aeb6c4]')}
              onClick={() => onWhich(choice)}
            >
              {t(`liveHud.hands.which_${choice}`)}
            </button>
          ))}
        </div>
        <button type="button" aria-label={t('common.close')} className="shrink-0 rounded p-1 text-[#aeb6c4] hover:bg-[#2f3646] hover:text-gray-100" onClick={onClose}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 overflow-y-auto">
        <Body state={state} which={which} />
      </div>
    </div>
  )
}
