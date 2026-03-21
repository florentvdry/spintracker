<template>
  <div class="flex items-center justify-between py-2 border-b border-dark-100/30">
    <span class="text-gray-400">{{ label }}</span>
    <span class="text-white font-medium"><slot></slot>{{ value }}</span>
  </div>
</template>

<script setup>
defineProps({
  label: String,
  value: [String, Number]
})
</script>
