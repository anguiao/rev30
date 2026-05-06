import type { ResourceTreeNode } from '@rev30/shared'
import type { Router } from 'vue-router'
import { refreshSession } from '../features/auth/requests'
import { useAuthStore } from '../stores/auth'

export const authRoutes = new Set(['/login', '/register'])
export const adminDefaultRoute = '/system/users'

function findFirstAccessibleInternalMenuPath(menus: ResourceTreeNode[]): string | null {
  for (const menu of menus) {
    if (menu.type === 'menu' && menu.path !== null) {
      return menu.path
    }

    const childPath = findFirstAccessibleInternalMenuPath(menu.children)

    if (childPath !== null) {
      return childPath
    }
  }

  return null
}

function resolveAdminDefaultRoute(menus: ResourceTreeNode[]) {
  return findFirstAccessibleInternalMenuPath(menus) ?? adminDefaultRoute
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
    const defaultRoute = resolveAdminDefaultRoute(auth.menus)

    if (authRoutes.has(to.path)) {
      return auth.isAuthenticated ? { path: defaultRoute } : true
    }

    if (auth.isAuthenticated) {
      return to.path === '/' ? { path: defaultRoute } : true
    }

    return { path: '/login', query: { redirect: to.fullPath } }
  })
}
