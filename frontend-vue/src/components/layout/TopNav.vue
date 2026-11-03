<template>
  <header class="h-11 shrink-0 flex items-center gap-6 px-5 bg-dark-400 border-b border-dark-200">
    <div class="flex items-center gap-2">
      <img :src="logo" alt="SpinTracker" class="w-5 h-5 object-contain" />
      <span class="font-semibold text-sm text-gray-100">SpinTracker</span>
    </div>

    <nav class="flex h-full gap-0.5">
      <RouterLink
        v-for="item in navigation"
        :key="item.href"
        :to="item.href"
        class="nav-item"
        :class="{ 'active': $route.path === item.href }"
      >
        {{ item.name }}
      </RouterLink>
    </nav>

    <div class="flex-1"></div>

    <RouterLink
      to="/settings"
      class="btn-icon"
      :class="{ 'text-primary-400': $route.path === '/settings' }"
      :title="$t('navigation.settings')"
    >
      <Settings class="w-4 h-4" />
    </RouterLink>
  </header>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Settings } from 'lucide-vue-next'
import logo from '@/assets/logo.png'

const { t } = useI18n()

const navigation = computed(() => [
  { name: t('navigation.dashboard'), href: '/' },
  { name: t('navigation.history'), href: '/hands' },
  { name: t('navigation.stats'), href: '/stats' },
  { name: t('navigation.ranges'), href: '/ranges' },
  { name: t('navigation.charts'), href: '/charts' },
  { name: t('navigation.multipliers'), href: '/multipliers' },
  { name: t('navigation.players'), href: '/players' },
])
</script>
