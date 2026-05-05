// @vitest-environment happy-dom

import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import HomePage from '../../src/pages/index.vue'
import SystemPage from '../../src/pages/system/index.vue'
import { disposeActiveTestPinia, mountAuthRoute, stubPreferredDark } from '../helpers/auth'

enableAutoUnmount(afterEach)

async function mountHomePage() {
  return mountAuthRoute('/', [
    { path: '/', component: HomePage },
    { path: '/system', component: SystemPage },
    { path: '/system/users', component: { template: '<main>System Users</main>' } },
    { path: '/login', component: { template: '<main>Login</main>' } },
  ])
}

describe('home page', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.className = ''
    document.documentElement.style.colorScheme = ''
    stubPreferredDark(false)
  })

  afterEach(() => {
    disposeActiveTestPinia()
    vi.unstubAllGlobals()
  })

  it('redirects root route to system users on mount', async () => {
    const { router } = await mountHomePage()
    await flushPromises()

    expect(router.currentRoute.value.fullPath).toBe('/system/users')
  })

  it('redirects system route to system users on mount', async () => {
    const { router } = await mountAuthRoute('/system', [
      { path: '/', component: HomePage },
      { path: '/system', component: SystemPage },
      { path: '/system/users', component: { template: '<main>System Users</main>' } },
      { path: '/login', component: { template: '<main>Login</main>' } },
    ])
    await flushPromises()

    expect(router.currentRoute.value.fullPath).toBe('/system/users')
  })
})
