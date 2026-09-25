import { DOMWrapper, flushPromises } from '@vue/test-utils'
import { assert, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../../src/stores/auth'
import { login } from '../../../src/features/auth/requests'
import LoginPage from '../../../src/pages/login.vue'
import { ApiRequestError } from '../../../src/utils/request'
import {
  mountAuthRoute,
  session,
  stubPreferredDark,
  triggerBrowserSubmit,
} from '../../helpers/auth'

vi.mock('../../../src/features/auth/requests', () => ({
  login: vi.fn(),
}))

const loginMock = vi.mocked(login)

async function mountLoginPage(path = '/login') {
  return mountAuthRoute(path, [
    { path: '/', component: { template: '<main>Home</main>' } },
    { path: '/login', component: LoginPage },
    { path: '/system/resources', component: { template: '<main>Resources</main>' } },
    { path: '/account/settings', component: { template: '<main>Account Settings</main>' } },
  ])
}

describe('login page', () => {
  beforeEach(() => {
    loginMock.mockReset()
    stubPreferredDark(false)
  })

  it('blocks invalid login submissions with field feedback without calling login', async () => {
    const { wrapper } = await mountLoginPage()

    await wrapper.find('[data-test="login-password"] input').setValue('password123')
    await wrapper.find('[data-test="login-submit"]').trigger('click')
    await flushPromises()

    expect(loginMock).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('请输入用户名')
  })

  it('stores the returned session and navigates home after successful login', async () => {
    loginMock.mockResolvedValue({ ...session, mustChangePassword: false })
    const { router, wrapper } = await mountLoginPage()

    await wrapper.find('[data-test="login-username"] input').setValue('ada')
    await wrapper.find('[data-test="login-password"] input').setValue(' short ')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const auth = useAuthStore()

    expect(loginMock).toHaveBeenCalledOnce()
    expect(loginMock).toHaveBeenCalledWith({
      username: 'ada',
      password: ' short ',
    })
    expect(auth.accessToken).toBe(session.accessToken)
    expect(auth.user).toEqual(session.user)
    expect(router.currentRoute.value.fullPath).toBe('/')
    expect(document.body.textContent).not.toContain('建议修改密码')
  })

  it('navigates to the redirect target after successful login', async () => {
    loginMock.mockResolvedValue({ ...session, mustChangePassword: false })
    const { router, wrapper } = await mountLoginPage('/login?redirect=/system/resources')

    await wrapper.find('[data-test="login-username"] input').setValue('ada')
    await wrapper.find('[data-test="login-password"] input').setValue('password123')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(router.currentRoute.value.fullPath).toBe('/system/resources')
  })

  it.each([
    { action: '稍后', target: '/system/resources' },
    { action: '去修改', target: '/account/settings' },
  ])(
    'offers an optional password reminder with $action after login',
    async ({ action, target }) => {
      loginMock.mockResolvedValue({ ...session, mustChangePassword: true })
      const { router, wrapper } = await mountLoginPage('/login?redirect=/system/resources')

      await wrapper.find('[data-test="login-username"] input').setValue('ada')
      await wrapper.find('[data-test="login-password"] input').setValue('temporary-password')
      await wrapper.find('form').trigger('submit')
      await flushPromises()

      expect(useAuthStore().isAuthenticated).toBe(true)
      expect(router.currentRoute.value.fullPath).toBe('/system/resources')
      const reminder = new DOMWrapper(document.body).get('[role="dialog"]')
      expect(reminder.isVisible()).toBe(true)
      expect(reminder.text()).toContain('当前使用临时密码，建议及时修改。')
      const button = reminder.findAll('button').find((button) => button.text() === action)
      assert(button, `Expected reminder action: ${action}`)
      await button.trigger('click')
      await flushPromises()

      expect(router.currentRoute.value.fullPath).toBe(target)
      await vi.waitFor(() => {
        expect(reminder.isVisible()).toBe(false)
      })
      await router.push('/')
      expect(router.currentRoute.value.fullPath).toBe('/')
      expect(
        new DOMWrapper(document.body)
          .findAll('[role="dialog"]')
          .some((dialog) => dialog.isVisible()),
      ).toBe(false)
    },
  )

  it('shows an invalid credentials error without storing a session', async () => {
    loginMock.mockRejectedValue(new ApiRequestError(401, '用户名或密码错误'))
    const { router, wrapper } = await mountLoginPage()

    await wrapper.find('[data-test="login-username"] input').setValue('ada')
    await wrapper.find('[data-test="login-password"] input').setValue('password123')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const auth = useAuthStore()
    expect(loginMock).toHaveBeenCalledOnce()
    expect(auth.isAuthenticated).toBe(false)
    expect(router.currentRoute.value.fullPath).toBe('/login')
    expect(wrapper.text()).toContain('用户名或密码错误')
  })

  it('calls login once when the browser submits the login form from the submit button', async () => {
    loginMock.mockResolvedValue({ ...session, mustChangePassword: false })
    const { wrapper } = await mountLoginPage()

    await wrapper.find('[data-test="login-username"] input').setValue('ada')
    await wrapper.find('[data-test="login-password"] input').setValue('password123')
    await triggerBrowserSubmit(wrapper)

    expect(loginMock).toHaveBeenCalledOnce()
  })
})
