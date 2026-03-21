<template>
  <div class="p-3 bg-dark-200 rounded-lg">
    <p class="text-xs text-gray-500 mb-1">{{ title }}</p>
    <p class="text-sm text-gray-300 whitespace-pre-line">{{ content }}</p>
  </div>
</template>

<script setup>
defineProps({
  title: String,
  content: String
})
</script>
