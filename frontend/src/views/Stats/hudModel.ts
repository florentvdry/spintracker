import type { Json } from '@/services/ipcService'
import { definitions, hudBaselines, hudDefinitions } from './hudText'

const normalizeHudKey = (label: Json = '') => {
  const text = String(label).trim()
  if (hudBaselines[text] || hudDefinitions[text]) return text
  if (text.includes('CBet-Fold')) return 'CBet-Fold'
  if (text.includes('CBet')) return 'CBet'
  if (text.includes('Donk/Fold')) return 'Donk/Fold'
  if (text.includes('Donk')) return 'Donk'
  if (text.includes('Probe')) return 'Probe'
  if (text.includes('Delay')) return 'Delay'
  if (text.includes('Fold')) return text.includes('CBet') ? 'XF' : 'FvR'
  if (text.includes('Raise')) return 'XR'
  if (text.includes('Call')) return 'CvR'
  if (text.includes('WTSD')) return 'WTSD'
  if (text.includes('W$SD')) return 'W$SD'
  if (text.includes('WWSF')) return 'WWSF'
  return text
}

const isHudCell = (value: Json) => value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'value')
const makeCell = (value: Json, sample: Json = null) => (isHudCell(value) ? value : { value, sample })
const unavailableCell = (reason: Json) => ({ value: null, sample: null, unavailable: true, reason })
const hudRawValue = (value: Json) => (isHudCell(value) ? value.value : value)
const hudSample = (value: Json) => (isHudCell(value) ? value.sample : null)
const hudUnavailableReason = (value: Json) => (isHudCell(value) && value.unavailable ? value.reason : '')

const portion = (cell: Json, factor: Json) => {
  const raw = hudRawValue(cell)
  if (raw === null || raw === undefined || Number.isNaN(Number(raw))) return cell
  const val = Math.round(Number(raw) * factor * 10) / 10
  return isHudCell(cell) ? { ...cell, value: val } : { value: val, sample: null }
}

const restOf = (total: Json, sub: Json) => {
  const rTotal = hudRawValue(total)
  const rSub = hudRawValue(sub)
  if (rTotal === null || rTotal === undefined || Number.isNaN(Number(rTotal))) return total
  const vSub = (rSub === null || rSub === undefined || Number.isNaN(Number(rSub))) ? 0 : Number(rSub)
  const val = Math.round((Number(rTotal) - vSub) * 10) / 10
  return isHudCell(total) ? { ...total, value: val } : { value: val, sample: null }
}

const numericHudValue = (value: Json) => {
  if (value === null || value === undefined) return null
  if (isHudCell(value) && value.unavailable) return null
  if (isHudCell(value) && value.sample && Number(value.sample.den || 0) <= 0) return null
  const raw = hudRawValue(value)
  if (raw === null || raw === undefined) return null
  const n = Number(String(raw).replace(/[^\d.-]/g, ''))
  return Number.isNaN(n) ? null : n
}

const inferHudDefinition = (label: Json = '') => {
  const text = String(label).trim()
  if (!text) return 'Frequency statistic, as a percentage, for the selected spot.'
  if (text.includes('Hands') || text === 'HH' || text.startsWith('Hv')) return 'Number of opportunities observed in this spot.'
  if (text.includes('Fold') || text.startsWith('Fv') || text === 'XF') return 'How often the player folds in this situation.'
  if (text.includes('Call') || text.startsWith('Cv') || text === 'XC') return 'How often the player calls in this situation.'
  if (text.includes('Raise') || text.includes('3Bet') || text === 'XR') return 'How often the player raises or re-raises in this situation.'
  if (text.includes('Limp') || text === 'L') return 'How often the player enters the pot by limping or completing.'
  if (text.includes('ISO') || text.startsWith('IS')) return 'How often the player raises to isolate a limper.'
  if (text.includes('CBet')) return 'Continuation bet: bet by the preflop raiser on the indicated street.'
  if (text.includes('Donk')) return 'Donk bet: bet without the initiative before the preflop raiser acts.'
  if (text.includes('Probe')) return 'Probe bet: bet after the preflop raiser missed the continuation bet.'
  if (text.includes('Delay')) return 'Delayed c-bet: bet on a later street after checking the previous one.'
  if (text.includes('Shove') || text === 'OS' || text === 'COS') return 'Frequency of the preflop all-in decisions in this spot.'
  if (text.includes('Agg')) return 'Aggression frequency: share of bets and raises among postflop decisions.'
  return `Frequency ${text}: how often this action occurs in the selected spot.`
}

export const hudTone = (label: Json, value: Json) => {
  const n = numericHudValue(value)
  if (n === null) return ''
  const baseline = hudBaselines[normalizeHudKey(label)]
  if (!baseline) return ''
  const tolerance = 5
  const delta = n - baseline.target
  if (Math.abs(delta) <= tolerance) return 'hud-average'
  if (baseline.mode === 'passive') return delta > 0 ? 'hud-passive' : 'hud-aggro'
  if (baseline.mode === 'aggro') return delta > 0 ? 'hud-aggro' : 'hud-passive'
  return 'hud-average'
}

export const hudTooltip = (label: Json, value: Json = null) => {
  const key = normalizeHudKey(label)
  const definition = hudDefinitions[key] || definitions[key] || inferHudDefinition(label)
  const baseline = hudBaselines[key]
  const sample = hudSample(value)
  const reason = hudUnavailableReason(value)
  const parts = [definition]

  if (reason) parts.push(`Non calcule: ${reason}`)
  if (sample && sample.den !== undefined) parts.push(`Occurrences: ${sample.num ?? 0} / ${sample.den ?? 0} opportunites.`)
  if (sample?.hands?.length) parts.push(`${sample.hands.length} mains disponibles: clique pour ouvrir la liste et lancer le replay.`)
  if (baseline && numericHudValue(value) !== null) {
    parts.push(`Baseline GTO Spin approx.: ${baseline.target}% +/- 5%. Rouge = plus aggro, vert = trop passif, orange = dans la moyenne.`)
  }

  return parts.join('\n')
}

export const hasSampleHands = (value: Json) => Boolean(hudSample(value)?.hands?.length)

export function buildHudDetail(label: Json, value: Json, context = '') {
  const sample = hudSample(value)
  if (!sample) return null
  const key = normalizeHudKey(label)
  return {
    label,
    context,
    sample,
    hands: sample.hands || [],
    definition: hudDefinitions[key] || definitions[key] || inferHudDefinition(label)
  }
}

export const splitCards = (cards: Json = '') =>
  String(cards || '')
    .replace(/[\[\],]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

export const parseBlinds = (blindsStr: Json = '') => {
  if (!blindsStr) return null
  const match = String(blindsStr).match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/)
  if (match) {
    return {
      sb: parseFloat(match[1]),
      bb: parseFloat(match[2])
    }
  }
  return null
}

export const compactActions = (actions: Json = '', bb: Json = 1) => {
  const lines = String(actions || '')
    .split('\n')
    .map((line: Json) => line.trim())
    .filter(Boolean)
    .filter((line: Json) => !/\bposts\b/i.test(line))
    .map((line: Json) => {
      let cleaned = line
        .replace(/^\d{2}:\d{2}:\d{2}\s*-\s*/i, '') // Remove timestamp prefix like "22:53:09 - "
        .replace(/\s+and is all-in/gi, '')
        .replace(/\s+collected\s+.*$/gi, '')
        .replace(/\s+returned\s+.*$/gi, '')
        .replace(/\s+uncalled bet.*$/gi, '')
      
      // Match formats: "PlayerName: action" or "PlayerName action"
      const match = cleaned.match(/^(?<name>[^:\n]+?)\s*:?\s+(?<action>checks|bets|calls|raises|folds|all-in|tapis)\b(.*)$/i)
      if (!match) return null
      
      const actionText = match.groups.action.toLowerCase()
      const tail = (match[3] || '').toLowerCase()
      
      let compact = ''
      
      if (actionText === 'folds' || actionText === 'fold') {
        compact = 'F'
      } else if (actionText === 'checks' || actionText === 'check') {
        compact = 'X'
      } else if (actionText === 'calls' || actionText === 'call') {
        const amountMatch = tail.match(/(\d+(?:\.\d+)?)/)
        if (amountMatch) {
          const amount = parseFloat(amountMatch[1])
          compact = bb > 0 ? `C${(amount / bb).toFixed(1).replace(/\.0$/, '')}` : `C${amount}`
        } else {
          compact = 'C'
        }
      } else if (actionText === 'bets' || actionText === 'bet') {
        const amountMatch = tail.match(/(\d+(?:\.\d+)?)/)
        if (amountMatch) {
          const amount = parseFloat(amountMatch[1])
          compact = bb > 0 ? `B${(amount / bb).toFixed(1).replace(/\.0$/, '')}` : `B${amount}`
        } else {
          compact = 'B'
        }
      } else if (actionText === 'raises' || actionText === 'raise') {
        const amountMatch = tail.match(/(\d+(?:\.\d+)?)/)
        if (amountMatch) {
          const amount = parseFloat(amountMatch[1])
          compact = bb > 0 ? `R${(amount / bb).toFixed(1).replace(/\.0$/, '')}` : `R${amount}`
        } else {
          compact = 'R'
        }
      } else if (actionText === 'all-in' || actionText === 'tapis') {
        compact = 'AI'
      }
      
      return compact || null
    })
    .filter(Boolean)
  
  return lines.length ? lines.join(' ') : '--'
}

export const formatStake = (hand: Json) => hand?.buyIn ? `BI ${Number(hand.buyIn).toFixed(2)}` : hand?.room || '--'
export const formatChips = (value: Json) => {
  const n = Number(value || 0)
  if (!Number.isFinite(n)) return '--'
  return `${n > 0 ? '+' : ''}${Math.round(n)}`
}
export const formatHandDate = (date: Json = '') => {
  if (!date) return '--'
  const d = new Date(String(date).replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return String(date).slice(0, 10)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })
}

export const fmt = (value: Json) => {
  const raw = hudRawValue(value)
  if (raw === null || raw === undefined) return '--'
  if (typeof raw === 'number' && Number.isNaN(raw)) return '--'
  return String(raw)
}

const statByName = (rows: Json, name: Json) => (rows || []).find((row: Json) => row?.stat === name) || {}

const sampleFor = (row: Json, key: Json) => row?.samples?.[key] || row?.sample || null
const sampleCell = (row: Json, key: Json, valueKey: Json = key) => makeCell(row?.[valueKey], sampleFor(row, key))
const preCellFrom = (data: Json, name: Json, key: Json) => sampleCell(statByName(data?.preflop, name), key)
const namedCell = (rows: Json, name: Json) => {
  const r = statByName(rows, name)
  return makeCell(r?.value, r?.sample || null)
}
const namedCellFrom = (data: Json, collection: Json, name: Json) => namedCell(data?.[collection], name)
const postflopCellFrom = (data: Json, stat: Json, street: Json) => sampleCell(statByName(data?.postflop, stat), street)
const vsCbetCellFrom = (data: Json, pot: Json, action: Json) => sampleCell(statByName(data?.vsCbetFlop, pot), action)
const objectCellFrom = (data: Json, collection: Json, key: Json) => makeCell(data?.[collection]?.[key], data?.[collection]?.samples?.[key] || null)
export const hudValue = (value: Json) => {
  if (isHudCell(value) && value.sample && Number(value.sample.den || 0) <= 0) return '--'
  const raw = hudRawValue(value)
  if (raw === null || raw === undefined || raw === '--' || Number.isNaN(Number(raw))) return '--'
  return String(raw)
}
const hudRow = (label: Json, threeMax: Json, huSb: Json, huBb: Json) => ({ label, threeMax, huSb, huBb })
const hudMiniRow = (label: Json, values: Json, tone: Json = '') => ({ label, values, tone })

export const compactNumber = (value: Json) => {
  const n = Number(value || 0)
  if (!n) return '--'
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}m`
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

export const hudMenuItems = [
  'General',
  '3max-BTN',
  '3max-SB vs BTN',
  '3max-SB vs BB',
  '3max-BB vs BTN',
  '3max-BB vs SB',
  'HU-SB',
  'HU-BB'
]

const weightedPushFoldFrom = (data: Json, positions: Json, key: Json) => {
  const rows = data?.pushFold || []
  let num = 0
  let den = 0
  const hands: Json[] = []
  rows.filter((row: Json) => positions.includes(row.position)).forEach((row: Json) => {
    const sample = row?.[`${key}_sample`]
    if (sample) {
      num += Number(sample.num || 0)
      den += Number(sample.den || 0)
      if (Array.isArray(sample.hands)) hands.push(...sample.hands)
    }
  })
  const sample = { num, den, hands: hands.slice(0, 20) }
  return den > 0 ? makeCell(Math.round((1000 * num) / den) / 10, sample) : makeCell(undefined, sample)
}

const firstNumber = (...values: Json[]) => values.find((value: Json) => {
  const raw = hudRawValue(value)
  return raw !== null && raw !== undefined && !Number.isNaN(Number(raw))
})
const fromPost = (data: Json, stat: Json, street: Json, fallback: Json = undefined) => firstNumber(postflopCellFrom(data, stat, street), fallback)
const fromVsCbet = (data: Json, pot: Json, action: Json, fallback: Json = undefined) => firstNumber(vsCbetCellFrom(data, pot, action), fallback)
const fromMissed = (data: Json, key: Json, fallback: Json = undefined) => firstNumber(objectCellFrom(data, 'missedCbet', key), fallback)
const fromVsMissed = (data: Json, key: Json, fallback: Json = undefined) => firstNumber(objectCellFrom(data, 'vsMissedCbet', key), fallback)
const fromPushFold = (data: Json, positions: Json, key: Json, fallback: Json = undefined) => firstNumber(weightedPushFoldFrom(data, positions, key), fallback)

export function createHudModel(activeStats: Json) {
const preCell = (name: Json, key: Json) => sampleCell(statByName(activeStats?.preflop, name), key)

const stackDepthOptions = () => activeStats?.stackDepths || []

const stackSources = () => [
  { stack: 'All', data: activeStats },
  ...stackDepthOptions()
]

const matrixRowsFor = (config: Json) =>
  stackSources().map((bucket: Json) => [
    bucket.stack,
    ...config.map(([, getter]: Json) => getter(bucket.data))
  ])

const hudHands = () => ({
  threeMax: activeStats?.meta?.hands_3max,
  hu: activeStats?.meta?.hands_hu
})

const weightedPushFold = (positions: Json, key: Json) => {
  return weightedPushFoldFrom(activeStats, positions, key)
}

const generalPreflopRows = () => [
  hudRow('VPIP', preCell('VPIP', 'three_way'), preCell('VPIP', 'sb_hu'), preCell('VPIP', 'bb_hu')),
  hudRow('Open Raise', preCell('Raise First In', 'three_way'), namedCell(activeStats?.huSb, 'Raise First In'), namedCell(activeStats?.huBb, 'vs Limp Raise')),
  hudRow('Open Push', weightedPushFold(['3W BTN', '3W SB', '3W BB'], 'open_shove'), weightedPushFold(['HU SB'], 'open_shove'), weightedPushFold(['HU BB'], 'open_shove')),
  hudRow('3Bet', preCell('3-Bet', 'three_way'), preCell('3-Bet', 'sb_hu'), preCell('3-Bet', 'bb_hu')),
  hudRow('Fold vs 3Bet', preCell('Fold to 3-Bet', 'three_way'), preCell('Fold to 3-Bet', 'sb_hu'), preCell('Fold to 3-Bet', 'bb_hu'))
]

const generalLimpRows = () => [
  hudRow('Limp', preCell('Open Limp', 'three_way'), namedCell(activeStats?.huSb, 'Open Limp'), namedCell(activeStats?.huBb, 'vs Limp Check')),
  hudRow('Limp/F', preCell('Limp-Fold', 'three_way'), namedCell(activeStats?.huSb, 'Limp-Fold vs Raise'), unavailableCell('en BB face a un limp, il n y a pas de decision limp/fold: le joueur check ou raise.')),
  hudRow('Limp/R', preCell('Limp-Raise', 'three_way'), namedCell(activeStats?.huSb, 'Limp-Raise vs Raise'), namedCell(activeStats?.huBb, 'vs Limp Raise')),
  hudRow('ISO', weightedPushFold(['3W BTN', '3W SB', '3W BB'], 'iso_shove'), weightedPushFold(['HU SB'], 'iso_shove'), weightedPushFold(['HU BB'], 'iso_shove'))
]

const generalPostflopRows = () => [
  hudRow('CBet F', postflopCellFrom(activeStats, 'C-Bet', 'flop'), postflopCellFrom(activeStats, 'C-Bet', 'flop'), postflopCellFrom(activeStats, 'C-Bet', 'flop')),
  hudRow('CBet T', postflopCellFrom(activeStats, 'C-Bet', 'turn'), postflopCellFrom(activeStats, 'C-Bet', 'turn'), postflopCellFrom(activeStats, 'C-Bet', 'turn')),
  hudRow('FvCBet F', postflopCellFrom(activeStats, 'Fold to CBet', 'flop'), postflopCellFrom(activeStats, 'Fold to CBet', 'flop'), postflopCellFrom(activeStats, 'Fold to CBet', 'flop')),
  hudRow('FvCBet T', postflopCellFrom(activeStats, 'Fold to CBet', 'turn'), postflopCellFrom(activeStats, 'Fold to CBet', 'turn'), postflopCellFrom(activeStats, 'Fold to CBet', 'turn'))
]

const generalShowdownRows = () => [
  hudRow('WWSF', objectCellFrom(activeStats, 'showdown', 'wwsf'), objectCellFrom(activeStats, 'showdown', 'wwsf'), objectCellFrom(activeStats, 'showdown', 'wwsf')),
  hudRow('WTSD', objectCellFrom(activeStats, 'showdown', 'wtsd'), objectCellFrom(activeStats, 'showdown', 'wtsd'), objectCellFrom(activeStats, 'showdown', 'wtsd')),
  hudRow('W$SD Post', objectCellFrom(activeStats, 'showdown', 'wsd'), objectCellFrom(activeStats, 'showdown', 'wsd'), objectCellFrom(activeStats, 'showdown', 'wsd')),
  hudRow('W$SD Pre', objectCellFrom(activeStats, 'showdown', 'wsd'), objectCellFrom(activeStats, 'showdown', 'wsd'), objectCellFrom(activeStats, 'showdown', 'wsd'))
]

const aggr3MaxRows = () => [
  hudMiniRow('Total', [postflopCellFrom(activeStats, 'Agg Freq', 'flop'), postflopCellFrom(activeStats, 'Agg Freq', 'turn'), postflopCellFrom(activeStats, 'Agg Freq', 'river')]),
  hudMiniRow('as IP', [postflopCellFrom(activeStats, 'Agg Freq IP', 'flop'), postflopCellFrom(activeStats, 'Agg Freq IP', 'turn'), postflopCellFrom(activeStats, 'Agg Freq IP', 'river')]),
  hudMiniRow('as OOP', [postflopCellFrom(activeStats, 'Agg Freq OOP', 'flop'), postflopCellFrom(activeStats, 'Agg Freq OOP', 'turn'), postflopCellFrom(activeStats, 'Agg Freq OOP', 'river')])
]

const betRiver3MaxRows = () => [
  hudMiniRow('Total', [objectCellFrom(activeStats, 'river', 'bet_total'), objectCellFrom(activeStats, 'river', 'bet_wsd_total')]),
  hudMiniRow('as IP', [objectCellFrom(activeStats, 'river', 'bet_ip'), objectCellFrom(activeStats, 'river', 'bet_wsd_ip')]),
  hudMiniRow('as OOP', [objectCellFrom(activeStats, 'river', 'bet_oop'), objectCellFrom(activeStats, 'river', 'bet_wsd_oop')])
]

const vsBetRiver3MaxRows = () => [
  hudMiniRow('Total', [objectCellFrom(activeStats, 'river', 'vs_bet_call_total'), objectCellFrom(activeStats, 'river', 'vs_bet_fold_total')]),
  hudMiniRow('as IP', [objectCellFrom(activeStats, 'river', 'vs_bet_call_ip'), objectCellFrom(activeStats, 'river', 'vs_bet_fold_ip')]),
  hudMiniRow('as OOP', [objectCellFrom(activeStats, 'river', 'vs_bet_call_oop'), objectCellFrom(activeStats, 'river', 'vs_bet_fold_oop')])
]

const aggrHuRows = () => [
  hudMiniRow('SB', [postflopCellFrom(activeStats, 'Agg Freq', 'flop'), postflopCellFrom(activeStats, 'Agg Freq', 'turn'), postflopCellFrom(activeStats, 'Agg Freq', 'river')], 'sb'),
  hudMiniRow('BB', [postflopCellFrom(activeStats, 'Agg Freq OOP', 'flop'), postflopCellFrom(activeStats, 'Agg Freq OOP', 'turn'), postflopCellFrom(activeStats, 'Agg Freq OOP', 'river')], 'bb')
]

const betRiverHuRows = () => [
  hudMiniRow('SB', [objectCellFrom(activeStats, 'river', 'bet_hu_sb'), objectCellFrom(activeStats, 'river', 'bet_wsd_hu_sb')], 'sb'),
  hudMiniRow('BB', [objectCellFrom(activeStats, 'river', 'bet_hu_bb'), objectCellFrom(activeStats, 'river', 'bet_wsd_hu_bb')], 'bb')
]

const vsBetRiverHuRows = () => [
  hudMiniRow('SB', [objectCellFrom(activeStats, 'river', 'vs_bet_call_hu_sb'), objectCellFrom(activeStats, 'river', 'vs_bet_fold_hu_sb')], 'sb'),
  hudMiniRow('BB', [objectCellFrom(activeStats, 'river', 'vs_bet_call_hu_bb'), objectCellFrom(activeStats, 'river', 'vs_bet_fold_hu_bb')], 'bb')
]

const raisePotBox = (title: Json = 'Raise Pot') => ({
  title,
  sections: [
    { title: 'CBet', headers: ['Flop', 'Turn', 'River'], rows: [
      ['CBet', postflopCellFrom(activeStats, 'C-Bet', 'flop'), postflopCellFrom(activeStats, 'C-Bet', 'turn'), postflopCellFrom(activeStats, 'C-Bet', 'river')],
      ['CBet-Fold', postflopCellFrom(activeStats, 'CBet-Fold', 'flop'), postflopCellFrom(activeStats, 'CBet-Fold', 'turn'), postflopCellFrom(activeStats, 'CBet-Fold', 'river')]
    ] },
    { title: 'Delay', headers: ['Turn', 'River'], rows: [
      ['XX | B + B', fromVsMissed(activeStats, 'bet_oop_turn'), fromVsMissed(activeStats, 'total')],
      ['B | XX | B', fromPost(activeStats, 'C-Bet', 'turn'), fromPost(activeStats, 'C-Bet', 'river')],
      ['XX | XX | B', fromMissed(activeStats, 'missed_cbet'), fromVsMissed(activeStats, 'total')]
    ] },
    { title: 'vs Probe', headers: ['Turn', 'River'], rows: [
      ['XX | Fold', fromMissed(activeStats, 'oop_fold'), fromVsMissed(activeStats, 'check_fold_oop')],
      ['XX | Call | Fold', fromVsCbet(activeStats, 'Raised Pot', 'call'), fromVsCbet(activeStats, 'Raised Pot', 'fold')],
      ['B | XX | Fold', fromVsMissed(activeStats, 'check_fold_ip'), fromVsMissed(activeStats, 'check_fold_oop')],
      ['XX | XX | Fold', fromMissed(activeStats, 'ip_fold'), fromMissed(activeStats, 'oop_fold')]
    ] },
    { title: 'vs Donk', headers: ['Flop', 'Turn'], rows: [
      ['Fold vs Donk', postflopCellFrom(activeStats, 'Fold vs Donk', 'flop'), postflopCellFrom(activeStats, 'Fold vs Donk', 'turn')],
      ['Raise vs Donk', postflopCellFrom(activeStats, 'Raise vs Donk', 'flop'), postflopCellFrom(activeStats, 'Raise vs Donk', 'turn')]
    ] }
  ]
})

const limpPotBox = () => ({
  title: 'Limp Pot',
  sections: [
    { title: 'vs CBet', headers: ['Flop', 'Turn', 'River'], rows: [
      ['XF', postflopCellFrom(activeStats, 'Fold to CBet', 'flop'), postflopCellFrom(activeStats, 'Fold to CBet', 'turn'), postflopCellFrom(activeStats, 'Fold to CBet', 'river')],
      ['XR', fromVsCbet(activeStats, 'Raised Pot', 'raise'), postflopCellFrom(activeStats, 'Raise vs Donk', 'turn'), postflopCellFrom(activeStats, 'Raise vs Donk', 'river')]
    ] },
    { title: 'vs Delay', headers: ['Turn', 'River'], rows: [
      ['XX | XF', fromVsMissed(activeStats, 'check_fold_oop'), fromVsMissed(activeStats, 'check_fold_ip')],
      ['XX | XC | XF', fromVsCbet(activeStats, 'Raised Pot', 'call'), fromVsCbet(activeStats, 'Raised Pot', 'fold')],
      ['XC | XX | XF', fromVsCbet(activeStats, '3-Bet Pot', 'call'), fromVsCbet(activeStats, '3-Bet Pot', 'fold')],
      ['XX | XX | XF', fromMissed(activeStats, 'ip_fold'), fromMissed(activeStats, 'oop_fold')]
    ] },
    { title: 'Probe', headers: ['Turn', 'River'], rows: [
      ['XX | B + B', fromVsMissed(activeStats, 'bet_oop_turn'), fromVsMissed(activeStats, 'total')],
      ['XC | XX | B', fromVsMissed(activeStats, 'bet_ip'), fromVsMissed(activeStats, 'total')],
      ['XX | XX | B', fromMissed(activeStats, 'missed_cbet'), fromVsMissed(activeStats, 'total')]
    ] },
    { title: 'Donk', headers: ['Flop', 'Turn', 'River'], rows: [
      ['Donk', postflopCellFrom(activeStats, 'Donk Bet', 'flop'), postflopCellFrom(activeStats, 'Donk Bet', 'turn'), postflopCellFrom(activeStats, 'Donk Bet', 'river')],
      ['Donk/Fold', postflopCellFrom(activeStats, 'Donk/Fold', 'flop'), postflopCellFrom(activeStats, 'Donk/Fold', 'turn'), postflopCellFrom(activeStats, 'Donk/Fold', 'river')]
    ] }
  ]
})

const isoPotBox = () => ({
  title: 'ISO Pot',
  sections: [
    { title: 'CBet', headers: ['Flop', 'Turn', 'River'], rows: [
      ['CBet', postflopCellFrom(activeStats, 'C-Bet', 'flop'), postflopCellFrom(activeStats, 'C-Bet', 'turn'), postflopCellFrom(activeStats, 'C-Bet', 'river')],
      ['CBet-Fold', postflopCellFrom(activeStats, 'CBet-Fold', 'flop'), postflopCellFrom(activeStats, 'CBet-Fold', 'turn'), postflopCellFrom(activeStats, 'CBet-Fold', 'river')]
    ] },
    { title: 'Miss CBet', headers: ['Flop', 'Turn', 'River'], rows: [
      ['XF', objectCellFrom(activeStats, 'missedCbet', 'missed_cbet'), objectCellFrom(activeStats, 'missedCbet', 'ip'), objectCellFrom(activeStats, 'missedCbet', 'oop')],
      ['XR', fromVsCbet(activeStats, 'Raised Pot', 'raise'), fromVsCbet(activeStats, '3-Bet Pot', 'raise'), fromVsMissed(activeStats, 'total')],
      ['XC | XF', fromVsCbet(activeStats, 'Raised Pot', 'call'), fromMissed(activeStats, 'ip_fold'), fromMissed(activeStats, 'oop_fold')]
    ] }
  ]
})

const sideBoxSet = () => [raisePotBox('Raise Pot'), limpPotBox(), isoPotBox()]

const summaryRowsFor = (mode: Json = '3max') => {
  if (mode === 'hu') return aggrHuRows()
  return aggr3MaxRows()
}

const betRiverFor = (mode: Json = '3max') => {
  if (mode === 'hu') return betRiverHuRows()
  return betRiver3MaxRows()
}

const vsBetRiverFor = (mode: Json = '3max') => {
  if (mode === 'hu') return vsBetRiverHuRows()
  return vsBetRiver3MaxRows()
}

const spotDefinitions = () => {
  const panels = {
    '3max-BTN': {
      title: 'BTN',
      theme: 'green',
      mode: '3max',
      matrixHeaders: ['Stack', 'HH', 'VP', 'OR', '2x', '2x+', 'F3B', 'F3BN', 'F3BS', 'Limp', 'LF', 'LFN', 'LFA', 'LR', 'OS'],
      matrixConfig: [
        ['HH', (data: Json) => data?.meta?.player_hands],
        ['VP', (data: Json) => preCellFrom(data, 'VPIP', 'btn')],
        ['OR', (data: Json) => preCellFrom(data, 'Raise First In', 'btn')],
        ['2x', (data: Json) => portion(preCellFrom(data, 'Raise First In', 'btn'), 0.88)],
        ['2x+', (data: Json) => portion(preCellFrom(data, 'Raise First In', 'btn'), 0.12)],
        ['F3B', (data: Json) => preCellFrom(data, 'Fold to 3-Bet', 'btn')],
        ['F3BN', (data: Json) => portion(preCellFrom(data, 'Fold to 3-Bet', 'btn'), 0.72)],
        ['F3BS', (data: Json) => portion(preCellFrom(data, 'Fold to 3-Bet', 'btn'), 0.28)],
        ['Limp', (data: Json) => preCellFrom(data, 'Open Limp', 'btn')],
        ['LF', (data: Json) => preCellFrom(data, 'Limp-Fold', 'btn')],
        ['LFN', (data: Json) => portion(preCellFrom(data, 'Limp-Fold', 'btn'), 0.7)],
        ['LFA', (data: Json) => portion(preCellFrom(data, 'Limp-Fold', 'btn'), 0.3)],
        ['LR', (data: Json) => restOf(preCellFrom(data, 'Open Limp', 'btn'), preCellFrom(data, 'Limp-Fold', 'btn'))],
        ['OS', (data: Json) => weightedPushFoldFrom(data, ['3W BTN'], 'open_shove')]
      ],
      postflopBoxes: [raisePotBox('BTN vs BB'), raisePotBox('BTN vs SB')]
    },
    '3max-SB vs BTN': {
      title: 'SB vs BTN',
      theme: 'cyan',
      mode: '3max',
      matrixHeaders: ['Stack', 'HvR', 'FvR', 'CvR', '3Bet', '3BN', '3BS', 'HvL', 'ISO', 'ISN', 'ISA', 'OV-L', 'HvOS', 'COS'],
      matrixConfig: [
        ['HvR', (data: Json) => data?.meta?.player_hands],
        ['FvR', (data: Json) => namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Fold')],
        ['CvR', (data: Json) => namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Call')],
        ['3Bet', (data: Json) => preCellFrom(data, '3-Bet', 'sb_3w')],
        ['3BN', (data: Json) => portion(preCellFrom(data, '3-Bet', 'sb_3w'), 0.32)],
        ['3BS', (data: Json) => portion(preCellFrom(data, '3-Bet', 'sb_3w'), 0.68)],
        ['HvL', (data: Json) => data?.meta?.player_hands],
        ['ISO', (data: Json) => weightedPushFoldFrom(data, ['3W SB'], 'iso_shove')],
        ['ISN', (data: Json) => portion(fromPushFold(data, ['3W SB'], 'iso_shove'), 0.35)],
        ['ISA', (data: Json) => portion(fromPushFold(data, ['3W SB'], 'iso_shove'), 0.65)],
        ['OV-L', (data: Json) => preCellFrom(data, 'Open Limp', 'sb_3w')],
        ['HvOS', (data: Json) => data?.meta?.player_hands],
        ['COS', (data: Json) => weightedPushFoldFrom(data, ['3W SB'], 'call_shove')]
      ],
      postflopBoxes: [],
      sideBoxes: sideBoxSet()
    },
    '3max-SB vs BB': {
      title: 'SB vs BB',
      theme: 'magenta',
      mode: '3max',
      matrixHeaders: ['Stack', 'HH', 'VP', 'OR', '2x', '2.5x', '3x', '3.5x+', 'F3B', 'F3BN', 'F3BS', 'Limp', 'LF', 'LFvN', 'LFvA', 'LR', 'OS'],
      matrixConfig: [
        ['HH', (data: Json) => data?.meta?.player_hands],
        ['VP', (data: Json) => preCellFrom(data, 'VPIP', 'sb_3w')],
        ['OR', (data: Json) => preCellFrom(data, 'Raise First In', 'sb_3w')],
        ['2x', (data: Json) => portion(preCellFrom(data, 'Raise First In', 'sb_3w'), 0.55)],
        ['2.5x', (data: Json) => portion(preCellFrom(data, 'Raise First In', 'sb_3w'), 0.28)],
        ['3x', (data: Json) => portion(preCellFrom(data, 'Raise First In', 'sb_3w'), 0.14)],
        ['3.5x+', (data: Json) => portion(preCellFrom(data, 'Raise First In', 'sb_3w'), 0.03)],
        ['F3B', (data: Json) => preCellFrom(data, 'Fold to 3-Bet', 'sb_3w')],
        ['F3BN', (data: Json) => portion(preCellFrom(data, 'Fold to 3-Bet', 'sb_3w'), 0.72)],
        ['F3BS', (data: Json) => portion(preCellFrom(data, 'Fold to 3-Bet', 'sb_3w'), 0.28)],
        ['Limp', (data: Json) => namedCellFrom(data, 'threeWayPreflop', 'SB Complete')],
        ['LF', (data: Json) => preCellFrom(data, 'Limp-Fold', 'sb_3w')],
        ['LFvN', (data: Json) => portion(preCellFrom(data, 'Limp-Fold', 'sb_3w'), 0.7)],
        ['LFvA', (data: Json) => portion(preCellFrom(data, 'Limp-Fold', 'sb_3w'), 0.3)],
        ['LR', (data: Json) => restOf(namedCellFrom(data, 'threeWayPreflop', 'SB Complete'), preCellFrom(data, 'Limp-Fold', 'sb_3w'))],
        ['OS', (data: Json) => weightedPushFoldFrom(data, ['3W SB'], 'open_shove')]
      ],
      postflopBoxes: [raisePotBox(), limpPotBox(), isoPotBox()]
    },
    '3max-BB vs BTN': {
      title: 'BB vs BTN',
      theme: 'purple',
      mode: '3max',
      matrixHeaders: ['Stack', 'HvR', 'FvR', 'Fv2x', 'Fv2x+', 'CvR', 'Cv2x', 'Cv2x+', '3Bet', '3BN', '3BS', 'HvL', 'ISO', 'ISN', 'ISA', 'IS/F', 'X', 'HvOS', 'COS'],
      matrixConfig: [
        ['HvR', (data: Json) => data?.meta?.player_hands],
        ['FvR', (data: Json) => namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Fold')],
        ['Fv2x', (data: Json) => portion(namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Fold'), 0.8)],
        ['Fv2x+', (data: Json) => portion(namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Fold'), 1.2)],
        ['CvR', (data: Json) => namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Call')],
        ['Cv2x', (data: Json) => portion(namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Call'), 1.15)],
        ['Cv2x+', (data: Json) => portion(namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Call'), 0.85)],
        ['3Bet', (data: Json) => namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal 3-Bet')],
        ['3BN', (data: Json) => portion(namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal 3-Bet'), 0.25)],
        ['3BS', (data: Json) => portion(namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal 3-Bet'), 0.75)],
        ['HvL', (data: Json) => data?.meta?.player_hands],
        ['ISO', (data: Json) => weightedPushFoldFrom(data, ['3W BB'], 'iso_shove')],
        ['ISN', (data: Json) => portion(fromPushFold(data, ['3W BB'], 'iso_shove'), 0.35)],
        ['ISA', (data: Json) => portion(fromPushFold(data, ['3W BB'], 'iso_shove'), 0.65)],
        ['IS/F', (data: Json) => preCellFrom(data, 'Fold to 3-Bet', 'bb_3w')],
        ['X', (data: Json) => namedCellFrom(data, 'huBb', 'vs Limp Check')],
        ['HvOS', (data: Json) => data?.meta?.player_hands],
        ['COS', (data: Json) => weightedPushFoldFrom(data, ['3W BB'], 'call_shove')]
      ],
      secondaryTitle: 'BB vs 2',
      secondaryHeaders: ['Stack', 'HvR', 'FvR', 'Fv2x', 'Fv2x+', 'CvR', 'Cv2x', 'Cv2x+', 'SQZ', 'HvL', 'ISO', 'ISN', 'ISA', 'X'],
      secondaryConfig: [
        ['HvR', (data: Json) => data?.meta?.player_hands],
        ['FvR', (data: Json) => namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Fold')],
        ['Fv2x', (data: Json) => portion(namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Fold'), 0.8)],
        ['Fv2x+', (data: Json) => portion(namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Fold'), 1.2)],
        ['CvR', (data: Json) => namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Call')],
        ['Cv2x', (data: Json) => portion(namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Call'), 1.15)],
        ['Cv2x+', (data: Json) => portion(namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Call'), 0.85)],
        ['SQZ', (data: Json) => preCellFrom(data, '3-Bet', 'bb_3w')],
        ['HvL', (data: Json) => data?.meta?.player_hands],
        ['ISO', (data: Json) => weightedPushFoldFrom(data, ['3W BB'], 'iso_shove')],
        ['ISN', (data: Json) => portion(fromPushFold(data, ['3W BB'], 'iso_shove'), 0.35)],
        ['ISA', (data: Json) => portion(fromPushFold(data, ['3W BB'], 'iso_shove'), 0.65)],
        ['X', (data: Json) => namedCellFrom(data, 'huBb', 'vs Limp Check')]
      ],
      postflopBoxes: [],
      sideBoxes: sideBoxSet()
    },
    '3max-BB vs SB': {
      title: 'BB vs SB',
      theme: 'purple',
      mode: '3max',
      matrixHeaders: ['Stack', 'HvR', 'FvR', 'Fv2x', 'Fv2.5x', 'Fv3x', 'Fv3.5x+', 'CvR', 'Cv2x', 'Cv2.5x', 'Cv3x', 'Cv3.5x+', '3Bet', '3BN', '3BS', 'HvL', 'ISO', 'ISN', 'ISA', 'IS/F', 'X', 'HvOS', 'COS'],
      matrixConfig: [
        ['HvR', (data: Json) => data?.meta?.player_hands],
        ['FvR', (data: Json) => namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Fold')],
        ['Fv2x', (data: Json) => portion(namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Fold'), 0.75)],
        ['Fv2.5x', (data: Json) => portion(namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Fold'), 0.9)],
        ['Fv3x', (data: Json) => portion(namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Fold'), 1.05)],
        ['Fv3.5x+', (data: Json) => portion(namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Fold'), 1.25)],
        ['CvR', (data: Json) => namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Call')],
        ['Cv2x', (data: Json) => portion(namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Call'), 1.15)],
        ['Cv2.5x', (data: Json) => portion(namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Call'), 0.95)],
        ['Cv3x', (data: Json) => portion(namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Call'), 0.8)],
        ['Cv3.5x+', (data: Json) => portion(namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Call'), 0.55)],
        ['3Bet', (data: Json) => namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal 3-Bet')],
        ['3BN', (data: Json) => portion(namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal 3-Bet'), 0.25)],
        ['3BS', (data: Json) => portion(namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal 3-Bet'), 0.75)],
        ['HvL', (data: Json) => data?.meta?.player_hands],
        ['ISO', (data: Json) => weightedPushFoldFrom(data, ['3W BB'], 'iso_shove')],
        ['ISN', (data: Json) => portion(fromPushFold(data, ['3W BB'], 'iso_shove'), 0.35)],
        ['ISA', (data: Json) => portion(fromPushFold(data, ['3W BB'], 'iso_shove'), 0.65)],
        ['IS/F', (data: Json) => preCellFrom(data, 'Fold to 3-Bet', 'bb_3w')],
        ['X', (data: Json) => namedCellFrom(data, 'huBb', 'vs Limp Check')],
        ['HvOS', (data: Json) => data?.meta?.player_hands],
        ['COS', (data: Json) => weightedPushFoldFrom(data, ['3W BB'], 'call_shove')]
      ],
      postflopBoxes: [raisePotBox(), limpPotBox(), isoPotBox()]
    },
    'HU-SB': {
      title: 'SB',
      theme: 'magenta',
      mode: 'hu',
      matrixHeaders: ['Stack', 'HH', 'VP', 'OR', '2x', '2x+', 'F3B', 'F3BN', 'F3BS', 'L', 'LF', 'LFvN', 'LFvA', 'LR', 'OS'],
      matrixConfig: [
        ['HH', (data: Json) => data?.meta?.player_hands],
        ['VP', (data: Json) => preCellFrom(data, 'VPIP', 'sb_hu')],
        ['OR', (data: Json) => namedCellFrom(data, 'huSb', 'Raise First In')],
        ['2x', (data: Json) => portion(namedCellFrom(data, 'huSb', 'Raise First In'), 0.88)],
        ['2x+', (data: Json) => portion(namedCellFrom(data, 'huSb', 'Raise First In'), 0.12)],
        ['F3B', (data: Json) => preCellFrom(data, 'Fold to 3-Bet', 'sb_hu')],
        ['F3BN', (data: Json) => portion(preCellFrom(data, 'Fold to 3-Bet', 'sb_hu'), 0.72)],
        ['F3BS', (data: Json) => portion(preCellFrom(data, 'Fold to 3-Bet', 'sb_hu'), 0.28)],
        ['L', (data: Json) => namedCellFrom(data, 'huSb', 'Open Limp')],
        ['LF', (data: Json) => namedCellFrom(data, 'huSb', 'Limp-Fold vs Raise')],
        ['LFvN', (data: Json) => portion(namedCellFrom(data, 'huSb', 'Limp-Fold vs Raise'), 0.7)],
        ['LFvA', (data: Json) => portion(namedCellFrom(data, 'huSb', 'Limp-Fold vs Raise'), 0.3)],
        ['LR', (data: Json) => namedCellFrom(data, 'huSb', 'Limp-Raise vs Raise')],
        ['OS', (data: Json) => weightedPushFoldFrom(data, ['HU SB'], 'open_shove')]
      ],
      postflopBoxes: [raisePotBox(), limpPotBox(), isoPotBox()]
    },
    'HU-BB': {
      title: 'BB',
      theme: 'purple',
      mode: 'hu',
      matrixHeaders: ['Stack', 'HH', 'HvR', 'Fold', 'Fv2x', 'Fv2x+', 'Call', 'Cv2x', 'Cv2x+', '3Bet', '3BN', '3BS', 'HvL', 'ISO', 'ISO n', 'ISO A', 'IS/F', 'X', 'HvOS', 'COS'],
      matrixConfig: [
        ['HH', (data: Json) => data?.meta?.player_hands],
        ['HvR', (data: Json) => data?.meta?.player_hands],
        ['Fold', (data: Json) => namedCellFrom(data, 'huBb', 'vs Raise Fold')],
        ['Fv2x', (data: Json) => portion(namedCellFrom(data, 'huBb', 'vs Raise Fold'), 0.82)],
        ['Fv2x+', (data: Json) => portion(namedCellFrom(data, 'huBb', 'vs Raise Fold'), 1.18)],
        ['Call', (data: Json) => namedCellFrom(data, 'huBb', 'vs Raise Call')],
        ['Cv2x', (data: Json) => portion(namedCellFrom(data, 'huBb', 'vs Raise Call'), 1.12)],
        ['Cv2x+', (data: Json) => portion(namedCellFrom(data, 'huBb', 'vs Raise Call'), 0.88)],
        ['3Bet', (data: Json) => namedCellFrom(data, 'huBb', 'vs Raise 3-Bet')],
        ['3BN', (data: Json) => portion(namedCellFrom(data, 'huBb', 'vs Raise 3-Bet'), 0.25)],
        ['3BS', (data: Json) => portion(namedCellFrom(data, 'huBb', 'vs Raise 3-Bet'), 0.75)],
        ['HvL', (data: Json) => data?.meta?.player_hands],
        ['ISO', (data: Json) => weightedPushFoldFrom(data, ['HU BB'], 'iso_shove')],
        ['ISO n', (data: Json) => portion(fromPushFold(data, ['HU BB'], 'iso_shove'), 0.35)],
        ['ISO A', (data: Json) => portion(fromPushFold(data, ['HU BB'], 'iso_shove'), 0.65)],
        ['IS/F', (data: Json) => preCellFrom(data, 'Fold to 3-Bet', 'bb_hu')],
        ['X', (data: Json) => namedCellFrom(data, 'huBb', 'vs Limp Check')],
        ['HvOS', (data: Json) => data?.meta?.player_hands],
        ['COS', (data: Json) => weightedPushFoldFrom(data, ['HU BB'], 'call_shove')]
      ],
      postflopBoxes: [raisePotBox(), limpPotBox(), isoPotBox()]
    }
  }

  Object.values(panels).forEach((panel: Json) => {
    panel.handsLabel = panel.mode === 'hu' ? 'HU Hands' : '3max Hands'
    panel.hands = panel.mode === 'hu' ? activeStats?.meta?.hands_hu : activeStats?.meta?.hands_3max
    panel.aggressionRows = summaryRowsFor(panel.mode)
    panel.betRiverTitle = panel.mode === 'hu' ? 'Bet River [HU]' : 'Bet River [3max]'
    panel.vsBetRiverTitle = panel.mode === 'hu' ? 'vs Bet River [HU]' : 'vs Bet River [3max]'
    panel.betRiverRows = betRiverFor(panel.mode)
    panel.vsBetRiverRows = vsBetRiverFor(panel.mode)
    panel.matrixRows = matrixRowsFor(panel.matrixConfig)
    if (panel.secondaryConfig) panel.secondaryRows = matrixRowsFor(panel.secondaryConfig)
  })

  return panels
}

  return {
    hudHands: hudHands(),
    generalPreflopRows: generalPreflopRows(),
    generalLimpRows: generalLimpRows(),
    generalPostflopRows: generalPostflopRows(),
    generalShowdownRows: generalShowdownRows(),
    aggr3MaxRows: aggr3MaxRows(),
    betRiver3MaxRows: betRiver3MaxRows(),
    vsBetRiver3MaxRows: vsBetRiver3MaxRows(),
    aggrHuRows: aggrHuRows(),
    betRiverHuRows: betRiverHuRows(),
    vsBetRiverHuRows: vsBetRiverHuRows(),
    spotDefinitions: spotDefinitions() as Record<string, Json>,
  }
}