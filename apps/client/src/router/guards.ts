import type { Router } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { refreshSession } from '../auth/requests'

export const authRoutes = new Set(['/login', '/register'])

export function installAuthGuards(router: Router) {
  router.beforeEach(async (to) => {
    const auth = useAuthStore()

    if (authRoutes.has(to.path)) {
      return auth.isAuthenticated ? { path: '/' } : true
    }

    if (to.path !== '/') {
      return true
    }

    if (auth.isAuthenticated) {
      return true
    }

    if (!auth.isReady) {
      try {
        auth.setSession(await refreshSession())
      } catch {
        auth.clearSession()
      } finally {
        auth.markReady()
      }
    }

    return auth.isAuthenticated ? true : { path: '/login', query: { redirect: to.fullPath } }
  })
}
