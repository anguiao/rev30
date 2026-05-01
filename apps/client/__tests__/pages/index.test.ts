// @vitest-environment happy-dom

import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../src/stores/auth'
import { logout } from '../../src/auth/requests'
import HomePage from '../../src/pages/index.vue'
import { disposeActiveTestPinia, mountAuthRoute, session, stubPreferredDark } from './helpers'

enableAutoUnmount(afterEach)

vi.mock('../../src/auth/requests', () => ({
  logout: vi.fn(),
}))

const logoutMock = vi.mocked(logout)

async function mountHomePage() {
  return mountAuthRoute('/', [
    { path: '/', component: HomePage },
    { path: '/login', component: { template: '<main>Login</main>' } },
  ])
}

describe('home page', () => {
  beforeEach(() => {
    logoutMock.mockReset()
    localStorage.clear()
    document.documentElement.className = ''
    document.documentElement.style.colorScheme = ''
    stubPreferredDark(false)
  })

  afterEach(() => {
    disposeActiveTestPinia()
    vi.unstubAllGlobals()
  })

  it('shows the current user summary on the home page', async () => {
    const { wrapper } = await mountHomePage()
    useAuthStore().setSession(session)
    await flushPromises()

    expect(wrapper.text()).toContain('Ada Lovelace')
    expect(wrapper.text()).toContain('ada')
  })

  it('logs out, clears the local session, and navigates to login', async () => {
    logoutMock.mockResolvedValue(undefined)
    const { router, wrapper } = await mountHomePage()
    const auth = useAuthStore()
    auth.setSession(session)

    await wrapper.find('[data-test="logout"]').trigger('click')
    await flushPromises()

    expect(logoutMock).toHaveBeenCalledOnce()
    expect(auth.isAuthenticated).toBe(false)
    expect(router.currentRoute.value.fullPath).toBe('/login')
  })

  it('clears the local session and navigates to login when logout fails', async () => {
    logoutMock.mockRejectedValue(new Error('logout failed'))
    const { router, wrapper } = await mountHomePage()
    const auth = useAuthStore()
    auth.setSession(session)

    await wrapper.find('[data-test="logout"]').trigger('click')
    await flushPromises()

    expect(logoutMock).toHaveBeenCalledOnce()
    expect(auth.isAuthenticated).toBe(false)
    expect(router.currentRoute.value.fullPath).toBe('/login')
  })
})
