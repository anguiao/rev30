// @vitest-environment happy-dom

import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../../src/stores/auth'
import { login } from '../../../src/features/auth/requests'
import LoginPage from '../../../src/pages/login.vue'
import {
  disposeActiveTestPinia,
  mountAuthRoute,
  session,
  stubPreferredDark,
  triggerBrowserSubmit,
} from '../../helpers/auth'

enableAutoUnmount(afterEach)

const { MockAuthRequestError } = vi.hoisted(() => ({
  MockAuthRequestError: class MockAuthRequestError extends Error {
    constructor(
      public readonly status: number,
      message: string,
      public readonly field?: string,
    ) {
      super(message)
      this.name = 'AuthRequestError'
    }
  },
}))

vi.mock('../../../src/features/auth/requests', () => ({
  AuthRequestError: MockAuthRequestError,
  login: vi.fn(),
}))

const loginMock = vi.mocked(login)

async function mountLoginPage(path = '/login') {
  return mountAuthRoute(path, [
    { path: '/', component: { template: '<main>Home</main>' } },
    { path: '/login', component: LoginPage },
    { path: '/register', component: { template: '<main>Register</main>' } },
    { path: '/system/resources', component: { template: '<main>Resources</main>' } },
  ])
}

describe('login page', () => {
  beforeEach(() => {
    loginMock.mockReset()
    localStorage.clear()
    document.documentElement.className = ''
    document.documentElement.style.colorScheme = ''
    stubPreferredDark(false)
  })

  afterEach(() => {
    disposeActiveTestPinia()
    vi.unstubAllGlobals()
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
    loginMock.mockResolvedValue(session)
    const { router, wrapper } = await mountLoginPage()

    await wrapper.find('[data-test="login-username"] input').setValue('ada')
    await wrapper.find('[data-test="login-password"] input').setValue('password123')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const auth = useAuthStore()

    expect(loginMock).toHaveBeenCalledOnce()
    expect(loginMock).toHaveBeenCalledWith({
      username: 'ada',
      password: 'password123',
    })
    expect(auth.accessToken).toBe(session.accessToken)
    expect(auth.user).toEqual(session.user)
    expect(router.currentRoute.value.fullPath).toBe('/')
  })

  it('navigates to the redirect target after successful login', async () => {
    loginMock.mockResolvedValue(session)
    const { router, wrapper } = await mountLoginPage('/login?redirect=/system/resources')

    await wrapper.find('[data-test="login-username"] input').setValue('ada')
    await wrapper.find('[data-test="login-password"] input').setValue('password123')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(router.currentRoute.value.fullPath).toBe('/system/resources')
  })

  it('calls login once when the browser submits the login form from the submit button', async () => {
    loginMock.mockResolvedValue(session)
    const { wrapper } = await mountLoginPage()

    await wrapper.find('[data-test="login-username"] input').setValue('ada')
    await wrapper.find('[data-test="login-password"] input').setValue('password123')
    await triggerBrowserSubmit(wrapper)

    expect(loginMock).toHaveBeenCalledOnce()
  })
})
