import type { ResourceTreeNode } from '@rev30/shared'
import type { Router } from 'vue-router'
import { refreshSession } from '../features/auth/requests'
import { useAuthStore } from '../stores/auth'

export const authRoutes = new Set(['/login', '/register'])

function findDefaultRoute(menus: ResourceTreeNode[]): string | null {
  for (const menu of menus) {
    if (menu.type === 'menu' && menu.path !== null) {
      return menu.path
    }

    const childPath = findDefaultRoute(menu.children)

    if (childPath !== null) {
      return childPath
    }
  }

  return null
}

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
    const defaultRoute = findDefaultRoute(auth.menus)
    const authenticatedEntryRoute = defaultRoute ?? '/403'

    if (authRoutes.has(to.path)) {
      return auth.isAuthenticated ? { path: authenticatedEntryRoute } : true
    }

    if (auth.isAuthenticated) {
      if (defaultRoute === null && to.path !== '/403') {
        return { path: '/403' }
      }

      return to.path === '/' ? { path: authenticatedEntryRoute } : true
    }

    return { path: '/login', query: { redirect: to.fullPath } }
  })
}
