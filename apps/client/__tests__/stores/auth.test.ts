import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { AuthTokenResponse } from '@rev30/contracts'
import { USER_STATUS_ENABLED } from '@rev30/contracts'
import { useAuthStore } from '../../src/stores/auth'

const session: AuthTokenResponse = {
  accessToken: 'access-token',
  tokenType: 'Bearer',
  expiresIn: 900,
  accessCodes: ['system:user:list', 'system:user:create', 'system:role:update'],
  menus: [
    {
      id: 'f905f4dc-c43f-41a8-b6fc-d381f291331a',
      parentId: null,
      type: 'directory',
      name: 'System',
      code: 'system',
      path: null,
      externalUrl: null,
      openTarget: 'self',
      icon: 'lucide:settings',
      hidden: false,
      status: 1,
      sortOrder: 0,
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
      children: [
        {
          id: '83d85ddf-9ebf-4f62-af9f-368af6d0d2a5',
          parentId: 'f905f4dc-c43f-41a8-b6fc-d381f291331a',
          type: 'menu',
          name: 'Users',
          code: 'system:user:list',
          path: '/system/users',
          externalUrl: null,
          openTarget: 'self',
          icon: 'lucide:users',
          hidden: false,
          status: 1,
          sortOrder: 1,
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
          children: [],
        },
        {
          id: '1d0a9843-8d29-4064-91f7-66769249caa9',
          parentId: 'f905f4dc-c43f-41a8-b6fc-d381f291331a',
          type: 'menu',
          name: 'Audit Log',
          code: 'system:audit-log',
          path: '/system/audit-log',
          externalUrl: null,
          openTarget: 'self',
          icon: 'lucide:history',
          hidden: true,
          status: 1,
          sortOrder: 2,
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
          children: [],
        },
      ],
    },
  ],
  user: {
    id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
    username: 'ada',
    nickname: 'Ada Lovelace',
    avatarId: null,
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

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('stores the access token, current user, access codes, and menus from a session response', () => {
    const auth = useAuthStore()

    auth.setSession(session)

    expect(auth.$state).toEqual({
      accessToken: 'access-token',
      accessCodes: session.accessCodes,
      menus: session.menus,
      user: session.user,
      isReady: false,
    })
    expect(auth.user?.departments).toEqual([])
    expect('refreshToken' in auth.$state).toBe(false)
    expect(auth.isAuthenticated).toBe(true)
  })

  it('clears session state without changing readiness', () => {
    const auth = useAuthStore()
    auth.setSession(session)
    auth.markReady()

    auth.clearSession()

    expect(auth.accessToken).toBeNull()
    expect(auth.accessCodes).toEqual([])
    expect(auth.menus).toEqual([])
    expect(auth.user).toBeNull()
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.isReady).toBe(true)
  })

  it('clears session state without marking an unready store as ready', () => {
    const auth = useAuthStore()
    auth.setSession(session)

    auth.clearSession()

    expect(auth.accessToken).toBeNull()
    expect(auth.accessCodes).toEqual([])
    expect(auth.menus).toEqual([])
    expect(auth.user).toBeNull()
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.isReady).toBe(false)
  })

  it('marks the initial session restore as ready', () => {
    const auth = useAuthStore()

    auth.markReady()

    expect(auth.isReady).toBe(true)
  })

  it('updates only user data when setting user and preserves session tokens', () => {
    const auth = useAuthStore()

    auth.setSession(session)
    const nextUser = {
      ...session.user,
      nickname: 'Ada Lovelace 2',
    }

    auth.setUser(nextUser)

    expect(auth.accessToken).toBe('access-token')
    expect(auth.accessCodes).toEqual(session.accessCodes)
    expect(auth.menus).toEqual(session.menus)
    expect(auth.isReady).toBe(false)
    expect(auth.user).toEqual(nextUser)
  })

  it('exposes can helpers based on the current access codes', () => {
    const auth = useAuthStore()
    auth.setSession(session)

    expect(auth.can('system:user:list')).toBe(true)
    expect(auth.can('system:user:delete')).toBe(false)
    expect(auth.canAny(['system:user:delete', 'system:user:create'])).toBe(true)
    expect(auth.canAny(['system:user:delete', 'system:role:delete'])).toBe(false)
    expect(auth.canAll(['system:user:list', 'system:user:create'])).toBe(true)
    expect(auth.canAll(['system:user:list', 'system:user:delete'])).toBe(false)
  })

  it('derives visible menus and accessible route paths from the full menu tree', () => {
    const auth = useAuthStore()
    auth.setSession(session)

    expect(auth.accessibleRoutePaths).toEqual(['/system/users', '/system/audit-log'])
    expect(auth.visibleMenus[0]?.children.map((menu) => menu.path)).toEqual(['/system/users'])
  })
})
