// @vitest-environment happy-dom

import { enableAutoUnmount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdminPage from '../../src/pages/index.vue'
import { disposeActiveTestPinia, mountAuthRoute, stubPreferredDark } from '../helpers/auth'

enableAutoUnmount(afterEach)

async function mountAdminRoute(path = '/') {
  return mountAuthRoute(path, [
    {
      path: '/',
      component: AdminPage,
      children: [{ path: 'system/users', component: { template: '<main>System Users</main>' } }],
    },
    { path: '/login', component: { template: '<main>Login</main>' } },
  ])
}

describe('admin route layout', () => {
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

  it('renders the admin layout around backend child routes', async () => {
    const { wrapper } = await mountAdminRoute('/system/users')

    expect(wrapper.text()).toContain('Rev30')
    expect(wrapper.text()).toContain('后台管理')
    expect(wrapper.text()).toContain('System Users')
  })
})
