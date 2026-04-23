import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'Dashboard',
    component: () => import('@/views/Dashboard/index.vue')
  },
  {
    path: '/tournaments',
    name: 'Tournaments',
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
