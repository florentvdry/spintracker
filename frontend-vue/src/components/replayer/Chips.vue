<script setup>
import { computed } from 'vue'

const props = defineProps({
  amount: { type: Number, default: 0 },
  bbValue: { type: Number, default: 1 },
  size: { type: String, default: 'md' }
})

// Real poker chip denominations adjusted to current blinds
const chipTypes = [
  { value: 1000, color: '#f97316', secondary: '#ffffff', name: 'orange' }, // 1000+
  { value: 500,  color: '#a855f7', secondary: '#fbbf24', name: 'purple' }, // 500
  { value: 100,  color: '#111827', secondary: '#ef4444', name: 'black' },  // 100
  { value: 25,   color: '#22c55e', secondary: '#ffffff', name: 'green' },  // 25
  { value: 5,    color: '#ef4444', secondary: '#ffffff', name: 'red' },    // 5
  { value: 1,    color: '#3b82f6', secondary: '#ffffff', name: 'blue' }    // 1
]

// Calculate stacks like a professional dealer
const stacks = computed(() => {
  if (props.amount <= 0) return []
  
  // Use a base unit relative to blinds (1 chip unit = 1/20th of a BB roughly)
  const unit = Math.max(1, props.bbValue / 20)
  let remaining = props.amount
  const visualChips = []
  
  // Break down amount into denominations
  for (const type of chipTypes) {
    const val = type.value * unit
    const count = Math.floor(remaining / val)
    if (count > 0) {
      // Add chips to our visual list (cap per denomination to keep it clean)
      for (let i = 0; i < Math.min(count, 12); i++) {
        visualChips.push(type)
      }
      remaining %= val
    }
    if (visualChips.length >= 25) break
  }

  if (visualChips.length === 0 && props.amount > 0) visualChips.push(chipTypes[chipTypes.length-1])

  // Group into columns (stacks) of max 5 chips
  const result = []
  const maxPerStack = 5
  for (let i = 0; i < visualChips.length; i += maxPerStack) {
    const chunk = visualChips.slice(i, i + maxPerStack)
    const stackIdx = i / maxPerStack
    
    // Staggered layout (triangle/messy pile)
    // First 3 stacks in front row, next 2 in back row, etc.
    const row = Math.floor(stackIdx / 3)
    const col = stackIdx % 3
    
    result.push({
      id: stackIdx,
      chips: chunk,
      x: col * (props.size === 'sm' ? 14 : 20) - (row * 8),
      y: row * (props.size === 'sm' ? 10 : 14)
    })
  }
  return result
})
</script>

<template>
  <div v-if="amount > 0" class="poker-chips-view pointer-events-none">
    <div class="relative flex items-center justify-center translate-y-[-10%]">
      <div 
        v-for="stack in stacks" 
        :key="stack.id"
        class="absolute"
        :style="{ 
          transform: `translate(${stack.x}px, ${stack.y}px)`, 
          zIndex: 100 - stack.y 
        }"
      >
        <!-- Stack of chips -->
        <div 
          v-for="(chip, index) in stack.chips" 
          :key="index"
          class="poker-chip"
          :class="[size]"
          :style="{ 
            '--chip-color': chip.color, 
            '--chip-secondary': chip.secondary,
            bottom: `${index * (size === 'sm' ? 2 : 3)}px` 
          }"
        >
          <!-- Surface of the chip -->
          <div class="chip-top">
            <div class="chip-inner">
              <div class="chip-center"></div>
            </div>
          </div>
          <!-- Thickness of the chip (Side) -->
          <div class="chip-side"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.poker-chips-view {
  perspective: 1000px;
  height: min(6vw, 40px);
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.poker-chip {
  position: absolute;
  width: 30px;
  height: 22px; 
  transform: rotateX(45deg);
  transform-style: preserve-3d;
  filter: drop-shadow(0 2px 3px rgba(0,0,0,0.4));
  left: -15px; /* Center horizontally */
}

.poker-chip.sm { width: 18px; height: 13px; left: -9px; }
.poker-chip.lg { width: 40px; height: 30px; left: -20px; }

/* Face supérieure */
.chip-top {
  position: absolute;
  inset: 0;
  background: var(--chip-color);
  border-radius: 50%;
  /* The dashed border simulates the rim patterns */
  border: 2px dashed var(--chip-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
  box-shadow: inset 0 0 8px rgba(0,0,0,0.3);
}

.chip-inner {
  width: 75%;
  height: 75%;
  border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(0,0,0,0.05);
}

/* Épaisseur du jeton (Tranche) */
.chip-side {
  position: absolute;
  top: 3px; 
  inset: 0;
  background: var(--chip-color);
  border-radius: 50%;
  transform: translateZ(-3px);
  z-index: 1;
  /* Vertical stripes on the side */
  background-image: linear-gradient(
    90deg,
    transparent 0%,
    transparent 40%,
    var(--chip-secondary) 40%,
    var(--chip-secondary) 60%,
    transparent 60%,
    transparent 100%
  );
  background-size: 25% 100%;
  filter: brightness(0.65); /* Occlusion */
}

.sm .chip-side { top: 1.5px; }
.lg .chip-side { top: 5px; }
</style>
