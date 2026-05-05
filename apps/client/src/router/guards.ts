import type { Router } from 'vue-router'
import { refreshSession } from '../features/auth'
import { useAuthStore } from '../stores/auth'

export const authRoutes = new Set(['/login', '/register'])
export const adminDefaultRoute = '/system/users'

export function installAuthGuards(router: Router) {
  router.beforeEach(async (to) => {
    const auth = useAuthStore()

    if (authRoutes.has(to.path)) {
      return auth.isAuthenticated ? { path: adminDefaultRoute } : true
    }

    if (!auth.isAuthenticated && !auth.isReady) {
      try {
        auth.setSession(await refreshSession())
      } catch {
        auth.clearSession()
      } finally {
        auth.markReady()
      }
    }

    if (auth.isAuthenticated) {
      return true
    }

    return { path: '/login', query: { redirect: to.fullPath } }
  })
}
