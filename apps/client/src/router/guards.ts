import type { ResourceTreeNode } from '@rev30/contracts'
import type { Pinia } from 'pinia'
import type { RouteLocationNormalized, Router } from 'vue-router'
import { watch } from 'vue'
import { refreshSession } from '../features/auth/requests'
import { useAuthStore } from '../stores/auth'
import { ApiRequestError } from '../utils/request'
import { resolveRedirectTarget } from './redirect'

const authRoutePaths = new Set(['/login'])
const accountRoutePaths = new Set(['/account/settings', '/account/announcements'])

function findDefaultRoutePath(
  menus: ResourceTreeNode[],
  registeredRoutePaths: ReadonlySet<string>,
): string | null {
  for (const menu of menus) {
    if (menu.type === 'menu' && menu.path !== null && registeredRoutePaths.has(menu.path)) {
      return menu.path
    }

    const childPath = findDefaultRoutePath(menu.children, registeredRoutePaths)

    if (childPath !== null) {
      return childPath
    }
  }

  return null
}

function getAuthenticatedEntryPath(router: Router, menus: ResourceTreeNode[]) {
  const registeredRoutePaths = new Set(router.getRoutes().map((route) => route.path))

  return findDefaultRoutePath(menus, registeredRoutePaths) ?? '/403'
}

function hasRouteAccess(to: RouteLocationNormalized, accessibleRoutePaths: readonly string[]) {
  if (to.matched.length === 0) {
    return false
  }

  const accessibleRoutePathSet = new Set(accessibleRoutePaths)
  const leafRoutePath = to.matched.at(-1)?.path

  return (
    accessibleRoutePathSet.has(to.path) ||
    (leafRoutePath !== undefined && accessibleRoutePathSet.has(leafRoutePath))
  )
}

function canKeepCurrentRoute(to: RouteLocationNormalized, accessibleRoutePaths: readonly string[]) {
  return (
    authRoutePaths.has(to.path) ||
    accountRoutePaths.has(to.path) ||
    to.path === '/' ||
    to.path === '/403' ||
    hasRouteAccess(to, accessibleRoutePaths)
  )
}

function resolveAuthenticatedEntryTarget(to: RouteLocationNormalized, fallback: string) {
  const redirectTarget = resolveRedirectTarget(to.query.redirect)
  const redirectPath = redirectTarget.split(/[?#]/, 1)[0] ?? ''

  return redirectTarget === '/' || authRoutePaths.has(redirectPath) ? fallback : redirectTarget
}

async function restoreSessionIfNeeded(auth: ReturnType<typeof useAuthStore>) {
  if (auth.isAuthenticated || auth.isReady) {
    return
  }

  try {
    auth.setSession(await refreshSession())
  } catch (error) {
    if (!(error instanceof ApiRequestError) || error.status !== 401) {
      throw error
    }

    auth.clearSession()
  }
}

export function installAuthGuards(router: Router, pinia: Pinia) {
  const auth = useAuthStore(pinia)

  router.beforeEach(async (to) => {
    await restoreSessionIfNeeded(auth)

    if (!auth.isAuthenticated) {
      return authRoutePaths.has(to.path)
        ? true
        : { path: '/login', query: { redirect: to.fullPath } }
    }

    if (authRoutePaths.has(to.path)) {
      return resolveAuthenticatedEntryTarget(
        to,
        getAuthenticatedEntryPath(router, auth.visibleMenus),
      )
    }

    if (to.path === '/') {
      return { path: getAuthenticatedEntryPath(router, auth.visibleMenus) }
    }

    if (accountRoutePaths.has(to.path) || to.path === '/403') {
      return true
    }

    return hasRouteAccess(to, auth.accessibleRoutePaths) ? true : { path: '/403' }
  })

  watch(
    () => auth.accessToken,
    (accessToken, previousAccessToken) => {
      if (previousAccessToken !== null && accessToken === null) {
        window.location.replace(router.resolve('/login').href)
      }
    },
  )

  watch(
    () => auth.accessibleRoutePaths,
    (accessibleRoutePaths) => {
      if (
        auth.isAuthenticated &&
        !canKeepCurrentRoute(router.currentRoute.value, accessibleRoutePaths)
      ) {
        window.location.replace(router.resolve('/403').href)
      }
    },
  )
}
