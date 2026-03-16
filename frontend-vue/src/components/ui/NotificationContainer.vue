<template>
  <Teleport to="body">
    <div class="fixed top-4 right-4 z-50 space-y-2">
      <TransitionGroup name="notification">
        <div
          v-for="notification in notifications"
          :key="notification.id"
          :class="[
            'flex items-start gap-3 p-4 rounded-lg shadow-xl max-w-sm animate-slide-up',
            'bg-dark-300 border',
            notification.type === 'success' ? 'border-green-500/30' :
            notification.type === 'error' ? 'border-red-500/30' :
            notification.type === 'warning' ? 'border-yellow-500/30' :
            'border-blue-500/30'
          ]"
        >
          <div :class="[
            'w-2 h-2 rounded-full mt-1.5 flex-shrink-0',
            notification.type === 'success' ? 'bg-green-500' :
            notification.type === 'error' ? 'bg-red-500' :
            notification.type === 'warning' ? 'bg-yellow-500' :
            'bg-blue-500'
          ]" />
          <div class="flex-1 min-w-0">
            <p v-if="notification.title" class="text-sm font-medium text-gray-100">
              {{ notification.title }}
            </p>
            <p class="text-sm text-gray-300" :class="{ 'mt-1': notification.title }">
              {{ notification.message }}
            </p>
          </div>
          <button
            @click="removeNotification(notification.id)"
            class="text-gray-400 hover:text-white flex-shrink-0"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue'
import { X } from 'lucide-vue-next'
import { useNotificationStore } from '@/stores/notificationStore'

const notificationStore = useNotificationStore()

const notifications = computed(() => notificationStore.notifications)

const removeNotification = (id) => {
  notificationStore.removeNotification(id)
}
</script>

<style scoped>
.notification-enter-active,
.notification-leave-active {
  transition: all 0.3s ease;
}

.notification-enter-from,
.notification-leave-to {
  opacity: 0;
  transform: translateX(30px);
}
</style>
