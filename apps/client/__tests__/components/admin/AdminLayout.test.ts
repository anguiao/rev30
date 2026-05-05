// @vitest-environment happy-dom

import { PiniaColada } from '@pinia/colada'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdminLayout from '../../../src/components/admin/AdminLayout.vue'
import { logout } from '../../../src/features/auth'
import { useAuthStore } from '../../../src/stores/auth'
import { session, stubPreferredDark } from '../../helpers/auth'

enableAutoUnmount(afterEach)

vi.mock('../../../src/features/auth', () => ({
  logout: vi.fn(),
}))

const logoutMock = vi.mocked(logout)

async function mountLayout() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/system/users', component: { template: '<main>Users</main>' } },
      { path: '/system/departments', component: { template: '<main>Departments</main>' } },
      { path: '/system/roles', component: { template: '<main>Roles</main>' } },
      { path: '/system/resources', component: { template: '<main>Resources</main>' } },
      { path: '/login', component: { template: '<main>Login</main>' } },
    ],
  })
  useAuthStore().setSession(session)
  await router.push('/system/users')
  await router.isReady()

  const wrapper = mount(AdminLayout, {
    slots: {
      default: '<section data-test="layout-content">Content</section>',
    },
    global: {
      plugins: [pinia, PiniaColada, router],
    },
  })

  return { router, wrapper }
}

describe('admin layout', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.className = ''
    document.documentElement.style.colorScheme = ''
    stubPreferredDark(false)
    logoutMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders navigation, branding, user summary, and content slot', async () => {
    const { wrapper } = await mountLayout()

    expect(wrapper.text()).toContain('Rev30')
    expect(wrapper.text()).toContain('后台管理')
    expect(wrapper.text()).toContain('系统管理')
    expect(wrapper.text()).toContain(session.user.nickname)
    expect(wrapper.text()).toContain(session.user.username)
    expect(wrapper.get('[data-test="layout-content"]').text()).toContain('Content')

    expect(wrapper.get('a[href="/system/users"]').text()).toContain('用户管理')
    expect(wrapper.get('a[href="/system/departments"]').text()).toContain('部门管理')
    expect(wrapper.get('a[href="/system/roles"]').text()).toContain('角色管理')
    expect(wrapper.get('a[href="/system/resources"]').text()).toContain('资源管理')
    expect(wrapper.html()).toContain('i-[lucide--users]')
    expect(wrapper.html()).toContain('i-[lucide--building-2]')
    expect(wrapper.html()).toContain('i-[lucide--shield-check]')
    expect(wrapper.html()).toContain('i-[lucide--blocks]')
    expect(wrapper.find('[data-test="theme-mode-trigger"]').exists()).toBe(true)
  })

  it('logs out, clears auth session, and navigates to login', async () => {
    logoutMock.mockResolvedValue(undefined)
    const { router, wrapper } = await mountLayout()
    const auth = useAuthStore()

    await wrapper.get('[data-test="admin-logout"]').trigger('click')
    await flushPromises()

    expect(logoutMock).toHaveBeenCalledTimes(1)
    expect(auth.isAuthenticated).toBe(false)
    expect(router.currentRoute.value.fullPath).toBe('/login')
  })

  it('clears auth session and navigates to login when logout fails', async () => {
    logoutMock.mockRejectedValue(new Error('network'))
    const { router, wrapper } = await mountLayout()
    const auth = useAuthStore()

    await wrapper.get('[data-test="admin-logout"]').trigger('click')
    await flushPromises()

    expect(logoutMock).toHaveBeenCalledTimes(1)
    expect(auth.isAuthenticated).toBe(false)
    expect(router.currentRoute.value.fullPath).toBe('/login')
  })
})
