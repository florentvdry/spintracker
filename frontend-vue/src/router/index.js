import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'Dashboard',
    component: () => import('@/views/Dashboard/index.vue')
  },
  {
    path: '/hands',
    name: 'HandHistory',
    component: () => import('@/views/HandHistory/index.vue')
  },
  {
    path: '/analysis',
    name: 'Analysis',
    component: () => import('@/views/Analysis/index.vue')
  },
  {
    path: '/ranges',
    name: 'RangeResearch',
    component: () => import('@/views/RangeResearch/index.vue')
  },
  {
    path: '/charts',
    name: 'Charts',
    component: () => import('@/views/Charts/index.vue')
  },
  {
    path: '/players',
    name: 'Players',
    component: () => import('@/views/Players/index.vue')
  },
  {
    path: '/stats',
    name: 'Stats',
    component: () => import('@/views/Stats/index.vue')
  },
  {
    path: '/multipliers',
    name: 'Multipliers',
    component: () => import('@/views/Multipliers/index.vue')
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('@/views/Settings/index.vue')
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
