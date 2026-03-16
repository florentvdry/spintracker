<template>
  <aside class="w-64 bg-dark-400 border-r border-dark-100/30 flex flex-col">
    <div class="h-50 flex items-center px-6 border-b border-dark-100/30">
      <div class="flex items-center gap-3">
        <img :src="logoUrl" alt="SpinTracker" class="w-24 h-24 object-contain py-2" />
        <div>
          <h1 class="text-xl font-bold gradient-text">SpinTracker</h1>
        </div>
      </div>
    </div>

    <nav class="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
      <RouterLink
        v-for="item in navigation"
        :key="item.href"
        :to="item.href"
        class="nav-item"
        :class="{ 'active': $route.path === item.href }"
      >
        <component :is="item.icon" class="w-5 h-5" />
        <span>{{ item.name }}</span>
      </RouterLink>
    </nav>

    <div class="p-4 border-t border-dark-100/30">
      <a 
        href="https://discord.gg/x9ZSQA2mN2" 
        target="_blank" 
        rel="noopener noreferrer"
        class="flex items-center gap-3 text-sm text-gray-500 hover:text-blue-400 transition-colors"
      >
        <MessageCircle class="w-4 h-4" />
        <span>Discord</span>
      </a>
    </div>
  </aside>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { 
  LayoutDashboard, 
  Users, 
  History, 
  Grid3X3, 
  Settings,
  BarChart2
} from 'lucide-vue-next'
import { MessageCircle } from 'lucide-vue-next'
import logo from '@/assets/logo.png'

const { t } = useI18n()

const logoUrl = computed(() => {
  return logo || ''
})

const navigation = computed(() => [
  { name: t('navigation.dashboard'), href: '/', icon: LayoutDashboard },
  { name: t('navigation.history'), href: '/hands', icon: History },
  { name: t('navigation.ranges'), href: '/ranges', icon: Grid3X3 },
  { name: t('navigation.charts'), href: '/charts', icon: BarChart2 },
  { name: t('navigation.players'), href: '/players', icon: Users },
  { name: t('navigation.settings'), href: '/settings', icon: Settings },
])
</script>
