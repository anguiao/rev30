import type { Router } from 'vue-router'
import { refreshSession } from '../features/auth/requests'
import { useAuthStore } from '../stores/auth'

export const authRoutes = new Set(['/login', '/register'])
export const adminDefaultRoute = '/system/users'

async function restoreSessionIfNeeded() {
  const auth = useAuthStore()

  if (auth.isAuthenticated || auth.isReady) {
    return
  }

  try {
    auth.setSession(await refreshSession())
  } catch {
    auth.clearSession()
  } finally {
    auth.markReady()
  }
}

export function installAuthGuards(router: Router) {
  router.beforeEach(async (to) => {
    await restoreSessionIfNeeded()

    const auth = useAuthStore()

    if (authRoutes.has(to.path)) {
      return auth.isAuthenticated ? { path: adminDefaultRoute } : true
    }

    if (auth.isAuthenticated) {
      return true
    }

    return { path: '/login', query: { redirect: to.fullPath } }
  })
}
