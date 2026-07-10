import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { logout } from '../../src/features/auth'
import ForbiddenPage from '../../src/pages/403.vue'
import { useAuthStore } from '../../src/stores/auth'
import { mountAuthRoute, session, stubPreferredDark } from '../helpers/auth'
vi.mock('../../src/features/auth', () => ({
  logout: vi.fn(),
}))

const logoutMock = vi.mocked(logout)

async function mountForbiddenPage() {
  return mountAuthRoute(
    '/403',
    [
      { path: '/403', component: ForbiddenPage },
      { path: '/login', component: { template: '<main>Login</main>' } },
    ],
    session,
  )
}

describe('forbidden page', () => {
  beforeEach(() => {
    logoutMock.mockReset()
    stubPreferredDark(false)
  })

  it('renders the no access result page', async () => {
    const { wrapper } = await mountForbiddenPage()

    expect(wrapper.text()).toContain('暂无可访问功能')
    expect(wrapper.text()).toContain('当前账号还没有可进入的后台页面，请联系管理员分配权限。')
    expect(wrapper.get('[data-test="forbidden-logout"]').text()).toContain('退出登录')
  })

  it('logs out, clears auth session, and navigates to login', async () => {
    logoutMock.mockResolvedValue(undefined)
    const { router, wrapper } = await mountForbiddenPage()
    const auth = useAuthStore()

    await wrapper.get('[data-test="forbidden-logout"]').trigger('click')
    await flushPromises()

    expect(logoutMock).toHaveBeenCalledTimes(1)
    expect(auth.isAuthenticated).toBe(false)
    expect(router.currentRoute.value.fullPath).toBe('/login')
  })
})
