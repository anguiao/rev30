import { createRouter, createWebHistory } from 'vue-router'
import { handleHotUpdate, routes } from 'vue-router/auto-routes'
import { installAuthGuards } from './guards'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

installAuthGuards(router)

if (import.meta.hot) {
  handleHotUpdate(router)
}
