import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { AuthTokenResponse } from '@rev30/shared'
import { USER_STATUS_ENABLED } from '@rev30/shared'
import { useAuthStore } from '../../src/stores/auth'

const session: AuthTokenResponse = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  tokenType: 'Bearer',
  expiresIn: 900,
  user: {
    id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
    username: 'ada',
    nickname: 'Ada Lovelace',
    email: null,
    phone: null,
    status: USER_STATUS_ENABLED,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
  },
}

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('stores only the access token and current user from a session response', () => {
    const auth = useAuthStore()

    auth.setSession(session)

    expect(auth.$state).toEqual({
      accessToken: 'access-token',
      user: session.user,
      isReady: false,
    })
    expect('refreshToken' in auth.$state).toBe(false)
    expect(auth.isAuthenticated).toBe(true)
  })

  it('clears session state without changing readiness', () => {
    const auth = useAuthStore()
    auth.setSession(session)
    auth.markReady()

    auth.clearSession()

    expect(auth.accessToken).toBeNull()
    expect(auth.user).toBeNull()
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.isReady).toBe(true)
  })

  it('clears session state without marking an unready store as ready', () => {
    const auth = useAuthStore()
    auth.setSession(session)

    auth.clearSession()

    expect(auth.accessToken).toBeNull()
    expect(auth.user).toBeNull()
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.isReady).toBe(false)
  })

  it('marks the initial session restore as ready', () => {
    const auth = useAuthStore()

    auth.markReady()

    expect(auth.isReady).toBe(true)
  })
})
