export function formatNumber(value, options = {}) {
  if (value === null || value === undefined) return '—'
  
  const { 
    locale = 'fr-FR',
    decimals = 0,
    style = 'decimal'
  } = options
  
  return new Intl.NumberFormat(locale, {
    style,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

export function formatCurrency(value, currency = '€') {
  if (value === null || value === undefined) return '—'
  return `${value.toFixed(2)}${currency}`
}

export function formatProfit(value, currency = '€') {
  if (value === null || value === undefined) return '—'
  
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}${currency}`
}

export function formatPercent(value, decimals = 1) {
  if (value === null || value === undefined) return '—'
  return `${value.toFixed(decimals)}%`
}

export function formatDate(dateStr, options = {}) {
  if (!dateStr) return '—'
  
  const {
    locale = 'fr-FR',
    format = 'short'
  } = options
  
  try {
    const date = new Date(dateStr)
    
    if (format === 'date-only') {
      return date.toLocaleDateString(locale, {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit'
      })
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

export function formatCards(cards) {
  if (!cards) return '—'
  return cards.replace(/([AKQJT2-9])([shdc])/gi, (match, rank, suit) => {
    const suitSymbols = { s: '♠', h: '♥', d: '♦', c: '♣' }
    return rank + (suitSymbols[suit.toLowerCase()] || suit)
  })
}

export function getProfitClass(value) {
  if (value > 0) return 'profit-positive'
  if (value < 0) return 'profit-negative'
  return 'text-gray-400'
}

export function parseCards(str) {
  if (!str || typeof str !== 'string') return []
  str = str.replace(/\s+/g, '')
  const cards = []
  for (let i = 0; i < str.length; i += 2) {
    const card = str.substring(i, i + 2)
    if (card.length === 2) cards.push(card)
  }
  return cards
}
