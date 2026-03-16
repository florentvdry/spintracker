<template>
  <div :class="['card', { 'card-flat': flat }, { 'p-0': padding === 'none' }]" :style="$attrs.style">
    <div v-if="title || $slots.header" class="flex items-start justify-between mb-4">
      <div>
        <h3 v-if="title" class="text-lg font-semibold text-white">{{ title }}</h3>
        <p v-if="subtitle" class="text-sm text-gray-400 mt-1">{{ subtitle }}</p>
      </div>
      <slot name="header"></slot>
    </div>
    <slot></slot>
  </div>
</template>

<script setup>
defineProps({
  title: String,
  subtitle: String,
  flat: Boolean,
  padding: {
    type: String,
    default: 'default'
  }
})
</script>
