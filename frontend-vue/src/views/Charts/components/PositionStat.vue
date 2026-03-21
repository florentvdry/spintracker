<template>
  <div class="flex justify-between items-center text-xs">
    <span :class="isSelected ? 'text-primary-400 font-medium' : 'text-gray-500'">{{ label }}</span>
    <span :class="['font-mono font-medium', parseFloat(value) >= 0 ? 'text-green-500' : 'text-red-500']">
      {{ parseFloat(value) > 0 ? '+' : '' }}{{ value }}
    </span>
  </div>
</template>

<script setup>
defineProps({
  label: String,
  value: [String, Number],
  isSelected: Boolean
})
</script>
