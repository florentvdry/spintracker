import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import './style.css'

const routes = [
  {
    path: '/',
    name: 'Dashboard',
    component: () => import('./views/Dashboard.vue')
  },
  {
    path: '/hands',
    name: 'Hands',
    component: () => import('./views/HandHistory.vue')
  },
  {
    path: '/players',
    name: 'Players',
    component: () => import('./views/Players.vue')
  },
  {
    path: '/tournaments',
    name: 'Tournaments',
    component: () => import('./views/Tournaments.vue')
  },
  {
    path: '/analysis',
    name: 'Analysis',
    component: () => import('./views/Analysis.vue')
  },
  {
    path: '/equity',
    name: 'Equity',
    component: () => import('./views/EquityCalculator.vue')
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('./views/Settings.vue')
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

const pinia = createPinia()
const app = createApp(App)

app.use(pinia)
app.use(router)
app.mount('#app')
