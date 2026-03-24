<template>
  <div class="p-3 bg-dark-200 rounded-lg" v-if="filteredContent.trim()">
    <p class="text-xs text-gray-500 mb-1">{{ title }}</p>
    <p class="text-sm text-gray-300 whitespace-pre-line">{{ filteredContent }}</p>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  title: String,
  content: String
})

const filteredContent = computed(() => {
  if (!props.content) return ''
  
  return props.content.split('\n').filter(line => {
    const text = line.toLowerCase()
    
    if (!text.trim()) return false
    
    const isAutomatic = 
      text.includes('posts sb') || 
      text.includes('posts bb') || 
      text.includes('ante') || 
      text.includes('dealing') ||
      text.includes('collected') ||
      text.includes('uncalled bet') ||
      text.includes('returned')
      
    return !isAutomatic
  }).join('\n')
})
</script>
