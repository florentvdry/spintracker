type Nullable<T> = T | null | undefined

export function formatNumber(
  value: Nullable<number>,
  options: { locale?: string; decimals?: number; style?: keyof Intl.NumberFormatOptionsStyleRegistry } = {},
): string {
  if (value === null || value === undefined) return '—'
  const { locale = 'fr-FR', decimals = 0, style = 'decimal' } = options
  return new Intl.NumberFormat(locale, {
    style,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

export function formatCurrency(value: Nullable<number>, currency = '€'): string {
  if (value === null || value === undefined) return '—'
  return `${value.toFixed(2)}${currency}`
}

export function formatProfit(value: Nullable<number>, currency = '€'): string {
  if (value === null || value === undefined) return '—'
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}${currency}`
}

export function formatPercent(value: Nullable<number>, decimals = 1): string {
  if (value === null || value === undefined) return '—'
  return `${value.toFixed(decimals)}%`
}

export function formatDate(
  dateStr: Nullable<string>,
  options: { locale?: string; format?: 'short' | 'date-only' } = {},
): string {
  if (!dateStr) return '—'
  const { locale = 'fr-FR', format = 'short' } = options

  try {
    const date = new Date(dateStr)
    if (format === 'date-only') {
      return date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: '2-digit' })
    }
    return date.toLocaleDateString(locale, {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}

const SUIT_SYMBOLS: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' }

export function formatCards(cards: Nullable<string>): string {
  if (!cards) return '—'
  return cards.replace(/([AKQJT2-9])([shdc])/gi, (_match, rank: string, suit: string) => {
    return rank + (SUIT_SYMBOLS[suit.toLowerCase()] ?? suit)
  })
}

export function getProfitClass(value: Nullable<number>): string {
  if (value !== null && value !== undefined && value > 0) return 'profit-positive'
  if (value !== null && value !== undefined && value < 0) return 'profit-negative'
  return 'text-gray-400'
}

export function parseCards(str: Nullable<string>): string[] {
  if (!str || typeof str !== 'string') return []
  const compact = str.replace(/\s+/g, '')
  const cards: string[] = []
  for (let i = 0; i < compact.length; i += 2) {
    const card = compact.substring(i, i + 2)
    if (card.length === 2) cards.push(card)
  }
  return cards
}
