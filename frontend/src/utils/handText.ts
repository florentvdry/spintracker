/**
 * A hand of the replayer as plain text: for GTO Wizard (PokerStars layout) and for a forum or
 * Discord (readable markdown). Both start from the same normalised hand.
 */
import type { Json } from '@/services/ipcService'

export type TextStreet = 'Preflop' | 'Flop' | 'Turn' | 'River'
export type TextActionKind = 'postSb' | 'postBb' | 'fold' | 'check' | 'call' | 'bet' | 'raise'

export interface TextAction {
  street: TextStreet
  player: string
  kind: TextActionKind
  /** Chips the action put in. */
  added: number
  /** What the player has in for the street once it is played ("raises to"). */
  to: number
  allIn: boolean
}

export interface TextPlayer {
  name: string
  seat: number
  position: string
  stack: number
  /** Two cards such as `Ah`, `7c`; empty when unknown. */
  cards: string[]
  isHero: boolean
}

export interface TextHand {
  id: string
  room: string
  date: string
  smallBlind: number
  bigBlind: number
  buyIn: number
  players: TextPlayer[]
  /** Flop, turn and river cards, in the order they came. */
  flop: string[]
  turn: string[]
  river: string[]
  actions: TextAction[]
  shows: { player: string; cards: string[] }[]
  collected: { player: string; amount: number }[]
  totalPot: number
}

const CARD_LENGTH = 2
const STREETS: TextStreet[] = ['Preflop', 'Flop', 'Turn', 'River']
const FLOP_SIZE = 3

export const splitCards = (text: unknown): string[] => (typeof text === 'string' ? (text.match(/.{2}/g) ?? []) : [])

function blindsOf(blinds: unknown): { sb: number; bb: number } {
  const [sb, bb] = String(blinds ?? '').split('/').map((part) => Number(part.replace(',', '.')))
  return { sb: Number.isFinite(sb) ? sb : 0, bb: Number.isFinite(bb) ? bb : 0 }
}

const kindOfType = (type: string): TextActionKind | null => {
  switch (type) {
    case 'PostSB':
      return 'postSb'
    case 'PostBB':
      return 'postBb'
    case 'Fold':
      return 'fold'
    case 'Check':
      return 'check'
    case 'Call':
      return 'call'
    case 'Bet':
      return 'bet'
    case 'Raise':
      return 'raise'
    default:
      return null
  }
}

/** Reads the replayer's hand (`GET /analysis/replayer/{id}`) into the shape the writers need. */
export function normalizeHand(handData: Json): TextHand {
  const { sb, bb } = blindsOf(handData.blinds)
  const players: TextPlayer[] = ((handData.players ?? []) as Json[]).map((p, index) => ({
    name: String(p.name),
    seat: index + 1,
    position: String(p.position ?? ''),
    stack: Number(p.initialStack) || 0,
    cards: splitCards(p.cards),
    isHero: p.isHero === true,
  }))
  const board = splitCards(handData.board)
  const hand: TextHand = {
    id: String(handData.handId ?? ''),
    room: String(handData.room ?? ''),
    date: String(handData.date ?? ''),
    smallBlind: sb,
    bigBlind: bb,
    buyIn: Number(handData.buyIn) || 0,
    players,
    flop: board.slice(0, FLOP_SIZE),
    turn: board.slice(FLOP_SIZE, FLOP_SIZE + 1),
    river: board.slice(FLOP_SIZE + 1, FLOP_SIZE + 2),
    actions: [],
    shows: [],
    collected: [],
    totalPot: Number(handData.totalPot) || 0,
  }

  // What each player has in for the street, and the highest of them: they tell a bet from a raise.
  let streetTotals = new Map<string, number>()
  let highest = 0
  const committed = new Map<string, number>()
  for (const action of (handData.actions ?? []) as Json[]) {
    const street = STREETS.includes(action.street) ? (action.street as TextStreet) : 'Preflop'
    if (action.type === 'DealCards') {
      if (street !== 'Preflop') {
        streetTotals = new Map()
        highest = 0
      }
      continue
    }
    if (action.type === 'ShowCards') {
      hand.shows.push({ player: String(action.playerName), cards: splitCards(action.cards) })
      continue
    }
    if (action.type === 'CollectPot') {
      hand.collected.push({ player: String(action.playerName), amount: Number(action.amount) || 0 })
      continue
    }
    const player = String(action.playerName ?? '')
    const added = Math.max(0, Number(action.potAfter) - Number(action.potBefore)) || 0
    const to = (streetTotals.get(player) ?? 0) + added
    let kind = action.type === 'AllIn' ? null : kindOfType(String(action.type))
    if (action.type === 'AllIn') kind = to > highest ? (highest > 0 ? 'raise' : 'bet') : 'call'
    if (!kind) continue
    // A raise that only completes a call is a call; a "bet" on top of a blind is a raise.
    if (kind === 'bet' && highest > 0) kind = 'raise'
    streetTotals.set(player, to)
    committed.set(player, (committed.get(player) ?? 0) + added)
    highest = Math.max(highest, to)
    const stack = players.find((p) => p.name === player)?.stack ?? 0
    hand.actions.push({ street, player, kind, added, to, allIn: action.type === 'AllIn' || (stack > 0 && (committed.get(player) ?? 0) >= stack) })
  }
  return hand
}

const num = (value: number): string => String(Math.round(value * 100) / 100)
const cardsText = (cards: string[]): string => cards.join(' ')

/** The seat that has the button: the "BTN" player, or the small blind heads-up. */
function buttonSeat(hand: TextHand): number {
  const named = hand.players.find((p) => p.position.includes('BTN')) ?? (hand.players.length === 2 ? hand.players.find((p) => p.position.includes('SB')) : undefined)
  return named?.seat ?? hand.players[0]?.seat ?? 1
}

/**
 * The hand in the PokerStars layout, which GTO Wizard reads. Uncalled bets returned to a player are
 * not written, and the tournament id is the hand id: the room's own ids are not kept.
 */
export function toGtoWizard(hand: TextHand): string {
  const lines: string[] = []
  const id = hand.id.replace(/\D/g, '').slice(0, 12) || '1'
  lines.push(`PokerStars Hand #${id}: Tournament #${id}, ${num(hand.buyIn)} USD Hold'em No Limit - Level I (${num(hand.smallBlind)}/${num(hand.bigBlind)}) - ${hand.date.replace(/-/g, '/').replace('T', ' ')} ET`)
  lines.push(`Table '${id} 1' ${hand.players.length}-max Seat #${buttonSeat(hand)} is the button`)
  for (const p of hand.players) lines.push(`Seat ${p.seat}: ${p.name} (${num(p.stack)} in chips)`)

  const writeAction = (action: TextAction) => {
    const allIn = action.allIn ? ' and is all-in' : ''
    switch (action.kind) {
      case 'postSb':
        return `${action.player}: posts small blind ${num(action.added)}${allIn}`
      case 'postBb':
        return `${action.player}: posts big blind ${num(action.added)}${allIn}`
      case 'fold':
        return `${action.player}: folds`
      case 'check':
        return `${action.player}: checks`
      case 'call':
        return `${action.player}: calls ${num(action.added)}${allIn}`
      case 'bet':
        return `${action.player}: bets ${num(action.added)}${allIn}`
      case 'raise':
        return `${action.player}: raises ${num(action.added)} to ${num(action.to)}${allIn}`
    }
  }

  const of = (street: TextStreet) => hand.actions.filter((a) => a.street === street)
  const preflop = of('Preflop')
  const blinds = preflop.filter((a) => a.kind === 'postSb' || a.kind === 'postBb')
  for (const action of blinds) lines.push(writeAction(action))
  lines.push('*** HOLE CARDS ***')
  const hero = hand.players.find((p) => p.isHero)
  if (hero && hero.cards.length === CARD_LENGTH) lines.push(`Dealt to ${hero.name} [${cardsText(hero.cards)}]`)
  for (const action of preflop.filter((a) => !blinds.includes(a))) lines.push(writeAction(action))

  const board: string[] = []
  const streets: [TextStreet, string[], string][] = [
    ['Flop', hand.flop, 'FLOP'],
    ['Turn', hand.turn, 'TURN'],
    ['River', hand.river, 'RIVER'],
  ]
  for (const [street, cards, title] of streets) {
    if (cards.length === 0) continue
    const before = [...board]
    board.push(...cards)
    lines.push(before.length === 0 ? `*** ${title} *** [${cardsText(cards)}]` : `*** ${title} *** [${cardsText(before)}] [${cardsText(cards)}]`)
    for (const action of of(street)) lines.push(writeAction(action))
  }

  if (hand.shows.length > 0) {
    lines.push('*** SHOW DOWN ***')
    for (const show of hand.shows) lines.push(`${show.player}: shows [${cardsText(show.cards)}]`)
  }
  for (const win of hand.collected) lines.push(`${win.player} collected ${num(win.amount)} from pot`)
  lines.push('*** SUMMARY ***')
  lines.push(`Total pot ${num(hand.totalPot)} | Rake 0`)
  if (board.length > 0) lines.push(`Board [${cardsText(board)}]`)
  return lines.join('\n')
}
