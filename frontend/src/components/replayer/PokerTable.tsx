import { useMemo } from 'react'
import logoUrl from '@/assets/logo.png'
import { selectCurrentAction, useReplayerStore } from '@/stores/replayerStore'
import Card from './Card'
import { formatReplayValue, parseBigBlind } from './format'
import PlayerSeat, { type SeatLayout } from './PlayerSeat'

const CENTER_SEAT: SeatLayout = { x: '50%', y: '50%', transform: 'translate(-50%, -50%)' }
const BOARD_SIZE = 5

const seat = (x: string, y: string, actionClass: string, betClass: string): SeatLayout => ({
  x, y, transform: 'translate(-50%, -50%)', actionClass, betClass,
})

// Seat positions relative to the hero, who always sits at the bottom.
const SEAT_LAYOUTS: Record<2 | 3 | 6, SeatLayout[]> = {
  2: [seat('50%', '78%', 'action-top', 'bet-top'), seat('50%', '22%', 'action-bottom', 'bet-bottom')],
  3: [
    seat('50%', '78%', 'action-top', 'bet-top'),
    seat('20%', '28%', 'action-bottom', 'bet-right'),
    seat('80%', '28%', 'action-bottom', 'bet-left'),
  ],
  6: [
    seat('50%', '78%', 'action-top', 'bet-top'),
    seat('18%', '62%', 'action-top', 'bet-right'),
    seat('18%', '32%', 'action-bottom', 'bet-right'),
    seat('50%', '20%', 'action-bottom', 'bet-bottom'),
    seat('82%', '32%', 'action-bottom', 'bet-left'),
    seat('82%', '62%', 'action-top', 'bet-left'),
  ],
}

export default function PokerTable() {
  const players = useReplayerStore((s) => s.players)
  const board = useReplayerStore((s) => s.board)
  const pot = useReplayerStore((s) => s.pot)
  const street = useReplayerStore((s) => s.street)
  const viewMode = useReplayerStore((s) => s.viewMode)
  const blinds = useReplayerStore((s) => s.handData?.blinds)
  const action = useReplayerStore(selectCurrentAction)

  const bbValue = parseBigBlind(blinds)
  const format = (value: unknown) => formatReplayValue(value, viewMode, bbValue)

  const seatEntries = useMemo(() => {
    const count = players.length
    const heroIndex = Math.max(0, players.findIndex((p) => p.isHero))
    const layout = count <= 2 ? SEAT_LAYOUTS[2] : count <= 3 ? SEAT_LAYOUTS[3] : SEAT_LAYOUTS[6]
    return players.map((player, index) => ({
      player,
      seat: layout[(index - heroIndex + count) % count] || layout[0],
    }))
  }, [players])

  const missingBoardCards = Math.max(0, BOARD_SIZE - board.length)
  const winnerSeat =
    (action?.playerName && seatEntries.find((e) => e.player.name === action.playerName)?.seat) || CENTER_SEAT

  return (
    <div className="table-wrap">
      <div className="table-stage">
        <div className="ambient-glow" />

        <div className="table-shell">
          <div className="table-rail">
            <div className="table-felt">
              <div className="felt-gradient" />
              <div className="betting-line" />

              <div className="table-brand">
                <img src={logoUrl} className="brand-logo" alt="SpinTracker" />
              </div>

              <div className="board-zone">
                {board.map((card, index) => (
                  <Card key={`${card}-${index}-${board.length}`} card={card} size="board" />
                ))}
                {board.length > 0 && Array.from({ length: missingBoardCards }, (_, i) => <div key={`placeholder-${i}`} className="board-placeholder" />)}
              </div>

              {pot > 0 && (
                <div className="pot-panel">
                  <span className="pot-label">Pot</span>
                  <span className="pot-value">{format(pot)}</span>
                  <span className="pot-unit">{viewMode === 'bb' ? 'bb' : 'chips'}</span>
                </div>
              )}

              <div className="street-pill">{street}</div>
            </div>
          </div>
        </div>

        {seatEntries.map((entry) => (
          <PlayerSeat key={entry.player.name} player={entry.player} seat={entry.seat} />
        ))}

        {action?.type === 'CollectPot' && (
          <div
            key={action.playerName || 'pot'}
            className="winner-chip pot-fly"
            style={{ left: winnerSeat.x, top: winnerSeat.y, transform: winnerSeat.transform }}
          >
            +{format(action.amount)}
          </div>
        )}
      </div>
    </div>
  )
}
