<template>
  <div :class="['card', { 'card-flat': flat }, { 'p-0': padding === 'none' }]" :style="$attrs.style">
    <div v-if="title || $slots.header" class="flex items-start justify-between gap-3 mb-3">
      <div>
        <h3 v-if="title" class="section-label">{{ title }}</h3>
        <p v-if="subtitle" class="text-xs text-gray-500 mt-0.5">{{ subtitle }}</p>
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
