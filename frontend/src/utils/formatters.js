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
    return `il y a ${minutes}min`;
  }
  return 'à l\'instant';
}

/**
 * Formate les cartes avec symboles
 */
export function formatCards(cards) {
  if (!cards) return '—';
  
  const suitSymbols = {
    s: '♠',
    h: '♥',
    d: '♦',
    c: '♣',
  };
  
  const suitColors = {
    s: 'text-gray-300',
    h: 'text-red-400',
    d: 'text-blue-400',
    c: 'text-green-400',
  };
  
  return cards.replace(/([AKQJT2-9])([shdc])/gi, (match, rank, suit) => {
    const symbol = suitSymbols[suit.toLowerCase()] || suit;
    return `${rank}${symbol}`;
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

/**
 * Escape HTML pour prévenir XSS
 */
export function escapeHtml(text) {
  if (!text) return '';
  
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  
  return String(text).replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Debounce function
 */
export function debounce(fn, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Throttle function
 */
export function throttle(fn, limit) {
  let inThrottle;
  return (...args) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Convertit des cartes en notation de main
 */
export function cardsToNotation(cards) {
  if (!cards) return '';
  
  const parts = cards.trim().split(/\s+/);
  if (parts.length !== 2) return cards;
  
  const rank1 = parts[0][0].toUpperCase();
  const suit1 = parts[0].slice(-1).toLowerCase();
  const rank2 = parts[1][0].toUpperCase();
  const suit2 = parts[1].slice(-1).toLowerCase();
  
  const rankOrder = 'AKQJT98765432';
  
  let r1 = rank1, r2 = rank2, s1 = suit1, s2 = suit2;
  if (rankOrder.indexOf(r1) > rankOrder.indexOf(r2)) {
    [r1, r2] = [r2, r1];
    [s1, s2] = [s2, s1];
  }
  
  if (r1 === r2) return `${r1}${r2}`;
  if (s1 === s2) return `${r1}${r2}s`;
  return `${r1}${r2}o`;
}
