<template>
  <div :class="['inline-block p-1 bg-dark-200 rounded-lg shadow-lg', className]">
    <div class="grid gap-0.5" style="grid-template-columns: repeat(13, 1fr)">
      <template v-for="(_, row) in CARDS" :key="row">
        <div
          v-for="(_, col) in CARDS"
          :key="`${row}-${col}`"
        >
          <div
            @click="handleCellClick(getCellData(row, col))"
            :style="getBackgroundStyle(getCellData(row, col).stats)"
            :class="[
              cellSizes[size],
              'flex flex-col items-center justify-center rounded cursor-pointer relative group leading-none',
              'transition-all duration-150',
              selectedHand === getCellData(row, col).hand ? 'ring-2 ring-white z-10' : 'hover:ring-1 hover:ring-gray-300 hover:z-10',
              getCellData(row, col).stats.TotalCount === 0 && 'opacity-40'
            ]"
            :title="`${getCellData(row, col).hand}: ${getCellData(row, col).stats.TotalCount} hands`"
          >
            <span :class="['font-medium drop-shadow-md', getCellData(row, col).stats.TotalCount > 0 ? 'text-white' : 'text-gray-500']">
              {{ getCellData(row, col).hand.replace('s', '').replace('o', '') }}
            </span>
            <span v-if="getCellData(row, col).stats.TotalCount > 0 && size !== 'sm'" class="text-[10px] text-white/90 font-bold drop-shadow-md mt-0.5 scale-90">
              {{ getCellData(row, col).stats.TotalCount }}
            </span>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  data: {
    type: Object,
    default: () => ({})
  },
  onCellClick: {
    type: Function,
    default: () => {}
  },
  selectedHand: String,
  size: {
    type: String,
    default: 'md'
  },
  className: String
})

const CARDS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2']

const ACTION_COLORS = {
  AllIn: '#b71c1c',
  Raise: '#f44336',
  Raise2_3BB: '#e5594f',
  Raise4BB: '#f97316',
  Bet: '#ff9800',
  Call: '#4caf50',
  Check: '#9e9e9e',
  Fold: '#2196f3',
  None: '#6366f1'
}

const cellSizes = {
  sm: 'w-6 h-6 text-[10px]',
  md: 'w-9 h-9 text-xs',
  lg: 'w-12 h-12 text-sm'
}

const maxTotalCount = computed(() => {
  const counts = Object.values(props.data).map(d => d.totalCount || d.TotalCount || 0)
  return Math.max(...counts, 1)
})

const hexToRgba = (hex, alpha) => {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const getCellData = (row, col) => {
  const card1 = CARDS[row]
  const card2 = CARDS[col]
  
  let hand
  if (row === col) {
    hand = `${card1}${card2}`
  } else if (row < col) {
    hand = `${card1}${card2}s`
  } else {
    hand = `${card2}${card1}o`
  }
  
  const raw = props.data[hand] || {}
  return {
    hand,
    stats: {
      TotalCount: raw.totalCount !== undefined ? raw.totalCount : (raw.TotalCount || 0),
      TotalProfit: raw.totalProfit !== undefined ? raw.totalProfit : (raw.TotalProfit || 0),
      TotalEv: raw.totalEv !== undefined ? raw.totalEv : (raw.TotalEv || 0),
      Actions: raw.actions || raw.Actions || {},
      Hands: raw.hands || raw.Hands || []
    }
  }
}

const getBackgroundStyle = (stats) => {
  const total = stats.TotalCount
  if (total === 0) return { backgroundColor: '#1e293b' }

  const volumeOpacity = 0.3 + (0.7 * (total / maxTotalCount.value))
  
  const actions = stats.Actions
  let gradientStops = []
  let currentPercent = 0

  const actionOrder = ['AllIn', 'Raise4BB', 'Raise2_3BB', 'Raise', 'Bet', 'Call', 'Check', 'Fold', 'None']
  
  const getActionColor = (action) => hexToRgba(ACTION_COLORS[action] || ACTION_COLORS.None, volumeOpacity)

  let dominantAction = null
  for (const action of actionOrder) {
    const count = actions[action] || 0
    if (count / total > 0.95) {
      dominantAction = action
      break
    }
  }
  
  if (dominantAction) {
    return { backgroundColor: getActionColor(dominantAction) }
  }

  actionOrder.forEach(action => {
    const count = actions[action] || 0
    if (count > 0) {
      const percent = (count / total) * 100
      const color = getActionColor(action)
      gradientStops.push(`${color} ${currentPercent}% ${currentPercent + percent}%`)
      currentPercent += percent
    }
  })

  if (gradientStops.length === 0) return { backgroundColor: '#1e293b' }

  return {
    background: `linear-gradient(to top, ${gradientStops.join(', ')})`
  }
}

const handleCellClick = (cellData) => {
  props.onCellClick?.(cellData.hand, cellData.stats)
}
</script>
