import type { Pinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import { handleHotUpdate, routes } from 'vue-router/auto-routes'
import { installAuthGuards } from './guards'

export function createAppRouter(pinia: Pinia) {
  const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes,
  })

  installAuthGuards(router, pinia)

  if (import.meta.hot) {
    handleHotUpdate(router)
  }

  return router
}
