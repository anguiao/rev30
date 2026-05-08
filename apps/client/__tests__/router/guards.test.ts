import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RESOURCE_TYPE_DIRECTORY,
  RESOURCE_TYPE_MENU,
  USER_STATUS_ENABLED,
  type AuthTokenResponse,
  type ResourceTreeNode,
} from '@rev30/shared'
import { useAuthStore } from '../../src/stores/auth'
import { refreshSession } from '../../src/features/auth/requests'
import { installAuthGuards } from '../../src/router/guards'

vi.mock('../../src/features/auth/requests', () => ({
  refreshSession: vi.fn(),
}))

const session: AuthTokenResponse = {
  accessToken: 'access-token',
  tokenType: 'Bearer',
  expiresIn: 900,
  accessCodes: [],
  menus: [],
  user: {
    id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
    username: 'ada',
    nickname: 'Ada Lovelace',
    email: null,
    phone: null,
    status: USER_STATUS_ENABLED,
    builtIn: false,
    departments: [],
    roles: [],
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
  },
}

const refreshSessionMock = vi.mocked(refreshSession)

function createMenuNode(
  overrides: Partial<ResourceTreeNode> & Pick<ResourceTreeNode, 'code' | 'name' | 'type'>,
): ResourceTreeNode {
  const { code, name, type, ...rest } = overrides

  return {
    id: `${code}-id`,
    parentId: null,
    type,
    name,
    code,
    path: null,
    externalUrl: null,
    openTarget: 'self',
    icon: null,
    hidden: false,
    status: 1,
    sortOrder: 0,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    children: [],
    ...rest,
  }
}

function createSession(menus: ResourceTreeNode[]): AuthTokenResponse {
  return {
    ...session,
    menus,
  }
}

function createTestRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<main>Home</main>' } },
      { path: '/account/settings', component: { template: '<main>Account Settings</main>' } },
      { path: '/system/departments', component: { template: '<main>System departments</main>' } },
      { path: '/system/roles', component: { template: '<main>System roles</main>' } },
      { path: '/system/users', component: { template: '<main>System users</main>' } },
      { path: '/403', component: { template: '<main>No access</main>' } },
      { path: '/login', component: { template: '<main>Login</main>' } },
      { path: '/register', component: { template: '<main>Register</main>' } },
    ],
  })

  installAuthGuards(router)

  return router
}

describe('auth guards', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    refreshSessionMock.mockReset()
  })

  it('restores the session before redirecting the protected root route to the default admin route', async () => {
    refreshSessionMock.mockResolvedValue(
      createSession([
        createMenuNode({
          code: 'system',
          name: 'System',
          type: RESOURCE_TYPE_DIRECTORY,
          children: [
            createMenuNode({
              code: 'system:user',
              name: 'Users',
              type: RESOURCE_TYPE_MENU,
              path: '/system/users',
              parentId: 'system-id',
            }),
          ],
        }),
      ]),
    )
    const router = createTestRouter()

    await router.push('/')

    const auth = useAuthStore()

    expect(refreshSessionMock).toHaveBeenCalledOnce()
    expect(auth.accessToken).toBe(session.accessToken)
    expect(auth.user).toEqual(session.user)
    expect(auth.isReady).toBe(true)
    expect(router.currentRoute.value.fullPath).toBe('/system/users')
  })

  it('redirects unauthenticated users from admin pages to login with redirect query', async () => {
    refreshSessionMock.mockRejectedValue(new Error('refresh failed'))
    const router = createTestRouter()

    await router.push('/system/users')

    const auth = useAuthStore()

    expect(refreshSessionMock).toHaveBeenCalledOnce()
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.isReady).toBe(true)
    expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.query).toEqual({ redirect: '/system/users' })
  })

  it('redirects unauthenticated users from account settings to login with redirect query', async () => {
    refreshSessionMock.mockRejectedValue(new Error('refresh failed'))
    const router = createTestRouter()

    await router.push('/account/settings')

    const auth = useAuthStore()

    expect(refreshSessionMock).toHaveBeenCalledOnce()
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.isReady).toBe(true)
    expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.query).toEqual({ redirect: '/account/settings' })
  })

  it('redirects authenticated users away from auth pages', async () => {
    const auth = useAuthStore()
    auth.setSession(
      createSession([
        createMenuNode({
          code: 'system',
          name: 'System',
          type: RESOURCE_TYPE_DIRECTORY,
          children: [
            createMenuNode({
              code: 'system:user',
              name: 'Users',
              type: RESOURCE_TYPE_MENU,
              path: '/system/users',
              parentId: 'system-id',
            }),
          ],
        }),
      ]),
    )
    auth.markReady()
    const router = createTestRouter()

    await router.push('/login')

    expect(refreshSessionMock).not.toHaveBeenCalled()
    expect(router.currentRoute.value.fullPath).toBe('/system/users')
  })

  it('restores a cold session before redirecting users away from auth pages', async () => {
    refreshSessionMock.mockResolvedValue(
      createSession([
        createMenuNode({
          code: 'system',
          name: 'System',
          type: RESOURCE_TYPE_DIRECTORY,
          children: [
            createMenuNode({
              code: 'system:user',
              name: 'Users',
              type: RESOURCE_TYPE_MENU,
              path: '/system/users',
              parentId: 'system-id',
            }),
          ],
        }),
      ]),
    )
    const router = createTestRouter()

    await router.push('/login')

    const auth = useAuthStore()

    expect(refreshSessionMock).toHaveBeenCalledOnce()
    expect(auth.accessToken).toBe(session.accessToken)
    expect(auth.user).toEqual(session.user)
    expect(auth.isReady).toBe(true)
    expect(router.currentRoute.value.fullPath).toBe('/system/users')
  })

  it('redirects authenticated users to the first accessible internal menu in server order', async () => {
    const auth = useAuthStore()
    auth.setSession(
      createSession([
        createMenuNode({
          code: 'system',
          name: 'System',
          type: RESOURCE_TYPE_DIRECTORY,
          children: [
            createMenuNode({
              code: 'system:role',
              name: 'Roles',
              type: RESOURCE_TYPE_MENU,
              path: '/system/roles',
              parentId: 'system-id',
              sortOrder: 10,
            }),
            createMenuNode({
              code: 'system:department',
              name: 'Departments',
              type: RESOURCE_TYPE_MENU,
              path: '/system/departments',
              parentId: 'system-id',
              sortOrder: 20,
            }),
          ],
        }),
      ]),
    )
    auth.markReady()
    const router = createTestRouter()

    await router.push('/login')

    expect(router.currentRoute.value.fullPath).toBe('/system/roles')
  })

  it('redirects authenticated users to the forbidden page when no internal menu is available', async () => {
    const auth = useAuthStore()
    auth.setSession(
      createSession([
        createMenuNode({
          code: 'system',
          name: 'System',
          type: RESOURCE_TYPE_DIRECTORY,
        }),
      ]),
    )
    auth.markReady()
    const router = createTestRouter()

    await router.push('/register')

    expect(router.currentRoute.value.fullPath).toBe('/403')
  })

  it('allows authenticated users without menus to access account settings', async () => {
    const auth = useAuthStore()
    auth.setSession(createSession([]))
    auth.markReady()
    const router = createTestRouter()

    await router.push('/account/settings')

    expect(router.currentRoute.value.fullPath).toBe('/account/settings')
  })

  it('redirects authenticated users without menus from protected admin pages to forbidden', async () => {
    const auth = useAuthStore()
    auth.setSession(createSession([]))
    auth.markReady()
    const router = createTestRouter()

    await router.push('/system/users')

    expect(router.currentRoute.value.fullPath).toBe('/403')
  })
})
