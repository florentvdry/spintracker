<template>
  <div class="flex items-center justify-between py-3 border-b border-dark-100/30 last:border-b-0">
    <div class="flex items-center gap-4">
      <div class="w-10 h-10 rounded-lg bg-dark-200 flex items-center justify-center">
        <component :is="icon" class="w-5 h-5 text-gray-400" />
      </div>
      <div>
        <p class="text-white font-medium">{{ title }}</p>
        <p class="text-sm text-gray-400">{{ description }}</p>
      </div>
    </div>
    <slot></slot>
  </div>
</template>

<script setup>
defineProps({
  icon: [Object, Function],
  title: String,
  description: String
})
</script>
