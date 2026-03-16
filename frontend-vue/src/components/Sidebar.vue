<template>
  <aside class="w-64 bg-dark-800 border-r border-dark-700 flex flex-col">
    <div class="p-4 border-b border-dark-700">
      <h1 class="text-xl font-bold text-primary-500">SpinTracker</h1>
    </div>
    <nav class="flex-1 p-4 space-y-2">
      <router-link
        v-for="item in menuItems"
        :key="item.path"
        :to="item.path"
        class="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-400 hover:text-white hover:bg-dark-700 transition-colors"
        active-class="bg-dark-700 text-white"
      >
        <component :is="item.icon" class="w-5 h-5" />
        <span>{{ item.label }}</span>
      </router-link>
    </nav>
    <div class="p-4 border-t border-dark-700">
      <div class="text-xs text-gray-500">
        Backend: Python FastAPI
      </div>
    </div>
  </aside>
</template>

<script setup>
import {
  LayoutDashboard,
  Hand,
  Users,
  Trophy,
  BarChart3,
  Calculator,
  Settings
} from 'lucide-vue-next'

const menuItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/hands', label: 'Mains', icon: Hand },
  { path: '/tournaments', label: 'Tournois', icon: Trophy },
  { path: '/players', label: 'Joueurs', icon: Users },
  { path: '/analysis', label: 'Analyse', icon: BarChart3 },
  { path: '/equity', label: 'Équité', icon: Calculator },
  { path: '/settings', label: 'Paramètres', icon: Settings }
]
</script>
