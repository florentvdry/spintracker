<template>
  <div 
    v-if="room"
    class="w-6 h-6 flex items-center justify-center"
    :title="roomName"
  >
    <img 
      :src="logoUrl" 
      :alt="roomName"
      class="w-full h-full object-contain"
    />
  </div>
  <div v-else class="w-6 h-6"></div>
</template>

<script setup>
import { computed } from 'vue'
import winamaxLogo from '@/assets/rooms/winamax.png'
import unibetLogo from '@/assets/rooms/unibet.png'
import betclicLogo from '@/assets/rooms/betclic.png'

const props = defineProps({
  room: {
    type: String,
    default: null
  }
})

const logoMap = {
  'winamax': winamaxLogo,
  'w': winamaxLogo,
  'unibet': unibetLogo,
  'u': unibetLogo,
  'betclic': betclicLogo,
  'b': betclicLogo
}

const logoUrl = computed(() => {
  if (!props.room) return null
  const room = props.room.toLowerCase()
  
  if (room.includes('winamax')) return logoMap['winamax']
  if (room.includes('unibet')) return logoMap['unibet']
  if (room.includes('betclic')) return logoMap['betclic']
  
  return logoMap[room] || null
})

const roomName = computed(() => {
  if (!props.room) return ''
  const roomMap = {
    'winamax': 'Winamax',
    'w': 'Winamax',
    'unibet': 'Unibet',
    'u': 'Unibet',
    'betclic': 'Betclic',
    'b': 'Betclic'
  }
  return roomMap[props.room.toLowerCase()] || props.room
})
</script>
