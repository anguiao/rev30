import { beforeEach, describe, expect, it } from 'vitest'
import type { AuthTokenResponse } from '@rev30/contracts'
import { session as baseSession } from '../helpers/session'
import { useAuthStore } from '../../src/stores/auth'
import { createTestPinia } from '../helpers/pinia'

const session: AuthTokenResponse = {
  ...baseSession,
  menus: [
    {
      ...baseSession.menus[0]!,
      children: [
        ...baseSession.menus[0]!.children,
        {
          ...baseSession.menus[0]!.children[0]!,
          id: '1d0a9843-8d29-4064-91f7-66769249caa9',
          name: 'Audit Log',
          code: 'system:audit-log',
          path: '/system/audit-log',
          icon: 'lucide:history',
          hidden: true,
          sortOrder: 2,
        },
      ],
    },
  ],
}

describe('auth store', () => {
  beforeEach(() => {
    createTestPinia()
  })

  it('stores the access token, current user, access codes, and menus from a session response', () => {
    const auth = useAuthStore()

    auth.setSession(session)

    expect(auth.$state).toEqual({
      accessToken: 'access-token',
      accessCodes: session.accessCodes,
      menus: session.menus,
      user: session.user,
      isReady: true,
    })
    expect(auth.user?.departments).toEqual([])
    expect('refreshToken' in auth.$state).toBe(false)
    expect(auth.isAuthenticated).toBe(true)
  })

  it('clears session state and keeps the store ready', () => {
    const auth = useAuthStore()
    auth.setSession(session)

    auth.clearSession()

    expect(auth.accessToken).toBeNull()
    expect(auth.accessCodes).toEqual([])
    expect(auth.menus).toEqual([])
    expect(auth.user).toBeNull()
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.isReady).toBe(true)
  })

  it('marks an empty session state as ready when clearing it', () => {
    const auth = useAuthStore()

    auth.clearSession()

    expect(auth.accessToken).toBeNull()
    expect(auth.accessCodes).toEqual([])
    expect(auth.menus).toEqual([])
    expect(auth.user).toBeNull()
    expect(auth.isAuthenticated).toBe(false)
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
    expect(auth.isReady).toBe(true)
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
