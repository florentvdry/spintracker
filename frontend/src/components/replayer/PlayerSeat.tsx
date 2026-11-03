import clsx from 'clsx'
import type { Json } from '@/services/ipcService'
import { isRealAction, selectCurrentAction, useReplayerStore } from '@/stores/replayerStore'
import Card from './Card'
import { formatReplayValue, parseBigBlind } from './format'

export interface SeatLayout {
  x: string
  y: string
  transform: string
  actionClass?: string
  betClass?: string
}

const ACTION_COLOR_CLASS: Record<string, string> = {
  Fold: 'action-fold',
  Check: 'action-check',
  Call: 'action-call',
  Bet: 'action-bet',
  Raise: 'action-raise',
  AllIn: 'action-allin',
  PostSB: 'action-blind',
  PostBB: 'action-blind',
}
const AMOUNT_ACTIONS = ['Bet', 'Raise', 'Call', 'AllIn']
const CARD_DEAL_STAGGER_MS = 150

function positionLabel(position: string | undefined): string {
  const pos = position || ''
  if (pos.includes('BTN')) return 'BTN'
  if (pos.includes('SB')) return 'SB'
  if (pos.includes('BB')) return 'BB'
  return pos || '-'
}

export default function PlayerSeat({ player, seat }: { player: Json; seat: SeatLayout }) {
  const viewMode = useReplayerStore((s) => s.viewMode)
  const showFoldedPlayers = useReplayerStore((s) => s.showFoldedPlayers)
  const blinds = useReplayerStore((s) => s.handData?.blinds)
  const action = useReplayerStore(selectCurrentAction)

  const bbValue = parseBigBlind(blinds)
  const format = (value: number) => formatReplayValue(value, viewMode, bbValue)
  const unitLabel = viewMode === 'bb' ? 'bb' : 'chips'

  const cards: string[] = player.cards ? String(player.cards).match(/.{1,2}/g) || [] : []
  const showCards = player.isHero || player.showCards
  const cardsToShow = player.isFolded ? [] : cards

  let actionText: string | null = null
  if (action && action.playerName === player.name && isRealAction(action)) {
    actionText =
      viewMode === 'bb' && bbValue > 0 && action.amount > 0 && AMOUNT_ACTIONS.includes(action.type)
        ? action.description.replace(/\d+/, format(action.amount))
        : action.description
  }
  const actionColor = action && action.playerName === player.name ? ACTION_COLOR_CLASS[action.type] ?? '' : ''

  return (
    <div
      className={clsx('player-seat', player.isFolded && 'is-folded', player.isAllIn && 'is-allin', player.isActive && 'is-active', !showFoldedPlayers && player.isFolded && 'hidden-folded')}
      style={{ left: seat.x, top: seat.y, transform: seat.transform }}
    >
      {player.isFolded && <div className="fold-badge">FOLD</div>}
      {player.isAllIn && <div className="allin-badge">ALL-IN</div>}

      {actionText && <div className={clsx('action-bubble', seat.actionClass, actionColor)}>{actionText}</div>}

      <div className={clsx('cards-row', player.isFolded && 'invisible')}>
        {showCards && cardsToShow.length > 0
          ? cardsToShow.map((card, index) => (
              <Card key={`${player.name}-${card}-${index}`} card={card} size="seat" className="card-deal" style={{ animationDelay: `${index * CARD_DEAL_STAGGER_MS}ms` }} />
            ))
          : !player.isFolded && (
              <>
                <Card key={`${player.name}-hidden-1`} hidden size="seat" className="card-deal" />
                <Card key={`${player.name}-hidden-2`} hidden size="seat" className="card-deal" />
              </>
            )}
      </div>

      <div className="seat-panel">
        <div className="seat-topline">
          <span className="position-chip">{positionLabel(player.position)}</span>
          {player.position?.includes('BTN') && <span className="dealer-button">D</span>}
        </div>
        <div className="player-name" title={player.name}>{player.name}</div>
        <div className="stack-line">
          <span className="stack-value">{format(player.currentStack)}</span>
          <span className="stack-unit">{unitLabel}</span>
        </div>
      </div>

      {player.bet > 0 && (
        <div className={clsx('bet-pill', seat.betClass)}>
          <span className="bet-dot" />
          <span>{format(player.bet)}</span>
        </div>
      )}
    </div>
  )
}
