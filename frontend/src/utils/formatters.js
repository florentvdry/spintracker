/**
 * Formate un nombre avec séparateurs
 */
export function formatNumber(value, options = {}) {
  if (value === null || value === undefined) return '—';
  
  const { 
    locale = 'fr-FR',
    decimals = 0,
    style = 'decimal'
  } = options;
  
  return new Intl.NumberFormat(locale, {
    style,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Formate un profit avec signe et devise
 */
export function formatProfit(value, currency = '€') {
  if (value === null || value === undefined) return '—';
  
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}${currency}`;
}

/**
 * Formate un pourcentage
 */
export function formatPercent(value, decimals = 1) {
  if (value === null || value === undefined) return '—';
  return `${value.toFixed(decimals)}%`;
}

/**
 * Formate une date
 */
export function formatDate(dateStr, options = {}) {
  if (!dateStr) return '—';
  
  const {
    locale = 'fr-FR',
    format = 'short' // 'short', 'long', 'relative'
  } = options;
  
  try {
    const date = new Date(dateStr);
    
    if (format === 'relative') {
      return formatRelativeDate(date);
    }
    
    if (format === 'long') {
      return date.toLocaleDateString(locale, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    
    return date.toLocaleDateString(locale, {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

/**
 * Formate une date relative (il y a X minutes, etc.)
 */
export function formatRelativeDate(date) {
  const now = new Date();
  const diff = now - date;
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 7) {
    return formatDate(date);
  }
  if (days > 0) {
    return `il y a ${days}j`;
  }
  if (hours > 0) {
    return `il y a ${hours}h`;
  }
  if (minutes > 0) {
    return `il y a ${minutes}m`;
  }
  
  return 'à l\'instant';
}

/**
 * Formate les cartes (remplace les lettres par des symboles)
 */
export function formatCards(cards) {
  if (!cards) return '—';
  return cards.replace(/([AKQJT2-9])([shdc])/gi, (match, rank, suit) => {
    const suitSymbols = { s: '♠', h: '♥', d: '♦', c: '♣' };
    return rank + (suitSymbols[suit.toLowerCase()] || suit);
  });
}

/**
 * Détermine la classe CSS pour un profit
 */
export function getProfitClass(value) {
  if (value > 0) return 'profit-positive';
  if (value < 0) return 'profit-negative';
  return 'text-gray-400';
}

