import type { ResourceTreeNode } from '@rev30/contracts'
import type { RouteLocationNormalized, Router } from 'vue-router'
import { refreshSession } from '../features/auth/requests'
import { useAuthStore } from '../stores/auth'
import { ApiRequestError } from '../utils/request'
import { resolveRedirectTarget } from './redirect'

export const authRoutes = new Set(['/login'])
export const accountRoutes = new Set(['/account/settings', '/account/announcements'])

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

function canAccessRoute(to: RouteLocationNormalized, routePaths: string[]) {
  const routePathSet = new Set(routePaths)
  const leafRoutePath = to.matched.at(-1)?.path

  return (
    routePathSet.has(to.path) || (leafRoutePath !== undefined && routePathSet.has(leafRoutePath))
  )
}

function resolveAuthenticatedEntryTarget(to: RouteLocationNormalized, fallback: string) {
  const redirectTarget = resolveRedirectTarget(to.query.redirect)
  const redirectPath = redirectTarget.split(/[?#]/, 1)[0] ?? ''

  return redirectTarget === '/' || authRoutes.has(redirectPath) ? fallback : redirectTarget
}

async function restoreSessionIfNeeded() {
  const auth = useAuthStore()

  if (auth.isAuthenticated || auth.isReady) {
    return
  }

  try {
    auth.setSession(await refreshSession())
    auth.markReady()
  } catch (error) {
    if (!(error instanceof ApiRequestError) || error.status !== 401) {
      throw error
    }

    auth.clearSession()
    auth.markReady()
  }
}

export function installAuthGuards(router: Router) {
  router.beforeEach(async (to) => {
    await restoreSessionIfNeeded()

    const auth = useAuthStore()
    const defaultRoute = findDefaultRoute(auth.visibleMenus)
    const authenticatedEntryRoute = defaultRoute ?? '/403'

    if (authRoutes.has(to.path)) {
      return auth.isAuthenticated
        ? resolveAuthenticatedEntryTarget(to, authenticatedEntryRoute)
        : true
    }

    if (auth.isAuthenticated) {
      if (accountRoutes.has(to.path) || to.path === '/403') {
        return true
      }

      if (to.path === '/') {
        return { path: authenticatedEntryRoute }
      }

      return canAccessRoute(to, auth.accessibleRoutePaths) ? true : { path: '/403' }
    }

    return { path: '/login', query: { redirect: to.fullPath } }
  })
}
