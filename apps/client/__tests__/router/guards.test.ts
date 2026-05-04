import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthTokenResponse } from '@rev30/shared'
import { USER_STATUS_ENABLED } from '@rev30/shared'
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
  user: {
    id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
    username: 'ada',
    nickname: 'Ada Lovelace',
    email: null,
    phone: null,
    status: USER_STATUS_ENABLED,
    departments: [],
    roles: [],
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
  },
}

const refreshSessionMock = vi.mocked(refreshSession)

function createTestRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<main>Home</main>' } },
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

  it('restores the session before entering the protected home route', async () => {
    refreshSessionMock.mockResolvedValue(session)
    const router = createTestRouter()

    await router.push('/')

    const auth = useAuthStore()

    expect(refreshSessionMock).toHaveBeenCalledOnce()
    expect(auth.accessToken).toBe(session.accessToken)
    expect(auth.user).toEqual(session.user)
    expect(auth.isReady).toBe(true)
    expect(router.currentRoute.value.fullPath).toBe('/')
  })

  it('redirects unauthenticated users to login when refresh fails, preserving redirect query and marking auth ready', async () => {
    refreshSessionMock.mockRejectedValue(new Error('refresh failed'))
    const router = createTestRouter()

    await router.push('/')

    const auth = useAuthStore()

    expect(refreshSessionMock).toHaveBeenCalledOnce()
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.isReady).toBe(true)
    expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.query).toEqual({ redirect: '/' })
  })

  it('redirects authenticated users away from auth pages', async () => {
    const auth = useAuthStore()
    auth.setSession(session)
    auth.markReady()
    const router = createTestRouter()

    await router.push('/login')

    expect(refreshSessionMock).not.toHaveBeenCalled()
    expect(router.currentRoute.value.fullPath).toBe('/')
  })
})
