/** A hand as the replayer holds it, reduced to what a shared copy needs. */
export interface ShareHand {
  room: string
  buyIn: number | string
  blinds: string
  date: string
  /** Board cards as one string: "AhKd7c". */
  board: string
  players: { name: string; position: string; cards: string[]; isHero: boolean }[]
  actions: { street: string; type: string; playerName: string | null; amount: number; description: string | null }[]
}

export const HERO_LABEL = 'Hero'
const OTHER_PREFIX = 'Player'
const NO_CARDS = '??'
const DEAL_ACTION = 'DealCards'

/**
 * Stable stand-in names: the hero keeps a role name, the others are numbered by seat order. The
 * same mapping is used for the whole copy, so one player keeps one name throughout.
 */
export function anonymousNames(players: ShareHand['players']): Map<string, string> {
  const names = new Map<string, string>()
  let index = 0
  for (const player of players) {
    if (names.has(player.name)) continue
    if (player.isHero) {
      names.set(player.name, HERO_LABEL)
    } else {
      index += 1
      names.set(player.name, `${OTHER_PREFIX} ${index}`)
    }
  }
  return names
}

/** Board as spaced cards: "Ah Kd 7c". */
export function formatBoard(board: string): string {
  return board.match(/.{1,2}/g)?.join(' ') ?? ''
}

/**
 * Markdown copy of a hand, for a forum or an issue. With `anonymize`, names are replaced everywhere
 * (including the action text, which is then written without the free description).
 */
export function handToMarkdown(hand: ShareHand, options: { anonymize: boolean }): string {
  const names = options.anonymize ? anonymousNames(hand.players) : new Map<string, string>()
  const nameOf = (name: string | null) => (name ? (names.get(name) ?? name) : '')
  const lines: string[] = []

  lines.push(`**${hand.room}** · buy-in ${hand.buyIn} · ${hand.date}`)
  lines.push(`Blinds ${hand.blinds}`)
  if (hand.board) lines.push(`Board: ${formatBoard(hand.board)}`)
  lines.push('')
  lines.push('Players:')
  for (const player of hand.players) {
    const cards = player.cards.length > 0 ? player.cards.join(' ') : NO_CARDS
    lines.push(`- ${nameOf(player.name) || player.name} (${player.position || '-'}): ${cards}`)
  }

  let street = ''
  for (const action of hand.actions) {
    if (action.type === DEAL_ACTION) continue
    if (action.street && action.street !== street) {
      street = action.street
      lines.push('', `${street}:`)
    }
    const who = nameOf(action.playerName)
    const amount = action.amount > 0 ? ` ${action.amount}` : ''
    const text = options.anonymize || !action.description ? `${action.type}${amount}` : action.description
    lines.push(`- ${who ? `${who}: ` : ''}${text}`)
  }
  return lines.join('\n')
}

/** Reads the replayer's hand data into the shape the copy needs. */
export function toShareHand(hand: Record<string, unknown>): ShareHand {
  const players = Array.isArray(hand.players) ? (hand.players as Record<string, unknown>[]) : []
  const actions = Array.isArray(hand.actions) ? (hand.actions as Record<string, unknown>[]) : []
  return {
    room: String(hand.room ?? ''),
    buyIn: (hand.buyIn as number | string | undefined) ?? '',
    blinds: String(hand.blinds ?? ''),
    date: String(hand.date ?? ''),
    board: String(hand.board ?? ''),
    players: players.map((p) => ({
      name: String(p.name ?? ''),
      position: String(p.position ?? ''),
      cards: Array.isArray(p.cards) ? p.cards.map(String) : [],
      isHero: p.isHero === true,
    })),
    actions: actions.map((a) => ({
      street: String(a.street ?? ''),
      type: String(a.type ?? ''),
      playerName: typeof a.playerName === 'string' ? a.playerName : null,
      amount: typeof a.amount === 'number' ? a.amount : 0,
      description: typeof a.description === 'string' ? a.description : null,
    })),
  }
}
