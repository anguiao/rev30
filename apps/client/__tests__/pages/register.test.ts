// @vitest-environment happy-dom

import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../src/stores/auth'
import { register } from '../../src/auth/requests'
import RegisterPage from '../../src/pages/register.vue'
import {
  disposeActiveTestPinia,
  mountAuthRoute,
  session,
  stubPreferredDark,
  triggerBrowserSubmit,
} from './helpers'

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

vi.mock('../../src/auth/requests', () => ({
  AuthRequestError: MockAuthRequestError,
  register: vi.fn(),
}))

const registerMock = vi.mocked(register)

async function mountRegisterPage() {
  return mountAuthRoute('/register', [
    { path: '/', component: { template: '<main>Home</main>' } },
    { path: '/login', component: { template: '<main>Login</main>' } },
    { path: '/register', component: RegisterPage },
  ])
}

describe('register page', () => {
  beforeEach(() => {
    registerMock.mockReset()
    localStorage.clear()
    document.documentElement.className = ''
    document.documentElement.style.colorScheme = ''
    stubPreferredDark(false)
  })

  afterEach(() => {
    disposeActiveTestPinia()
    vi.unstubAllGlobals()
  })

  it('blocks invalid registration submissions with field feedback without calling register', async () => {
    const { wrapper } = await mountRegisterPage()

    await wrapper.find('[data-test="register-nickname"] input').setValue('Ada Lovelace')
    await wrapper.find('[data-test="register-password"] input').setValue('password123')
    await wrapper.find('[data-test="register-submit"]').trigger('click')
    await flushPromises()

    expect(registerMock).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('请输入用户名')
  })

  it('blocks registration when the confirmation password does not match', async () => {
    const { wrapper } = await mountRegisterPage()

    await wrapper.find('[data-test="register-username"] input').setValue('ada')
    await wrapper.find('[data-test="register-nickname"] input').setValue('Ada Lovelace')
    await wrapper.find('[data-test="register-password"] input').setValue('password123')
    await wrapper.find('[data-test="register-confirm-password"] input').setValue('different123')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(registerMock).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('两次输入的密码不一致')
  })

  it('stores the returned session and navigates home after successful registration', async () => {
    registerMock.mockResolvedValue(session)
    const { router, wrapper } = await mountRegisterPage()

    await wrapper.find('[data-test="register-username"] input').setValue('ada')
    await wrapper.find('[data-test="register-nickname"] input').setValue('Ada Lovelace')
    await wrapper.find('[data-test="register-password"] input').setValue('password123')
    await wrapper.find('[data-test="register-confirm-password"] input').setValue('password123')
    await wrapper.find('[data-test="register-email"] input').setValue('')
    await wrapper.find('[data-test="register-phone"] input').setValue('')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const auth = useAuthStore()

    expect(registerMock).toHaveBeenCalledOnce()
    expect(registerMock).toHaveBeenCalledWith({
      username: 'ada',
      nickname: 'Ada Lovelace',
      password: 'password123',
      email: null,
      phone: null,
    })
    expect(auth.accessToken).toBe(session.accessToken)
    expect(auth.user).toEqual(session.user)
    expect(router.currentRoute.value.fullPath).toBe('/')
  })

  it('calls register once when the browser submits the registration form from the submit button', async () => {
    registerMock.mockResolvedValue(session)
    const { wrapper } = await mountRegisterPage()

    await wrapper.find('[data-test="register-username"] input').setValue('ada')
    await wrapper.find('[data-test="register-nickname"] input').setValue('Ada Lovelace')
    await wrapper.find('[data-test="register-password"] input').setValue('password123')
    await wrapper.find('[data-test="register-confirm-password"] input').setValue('password123')
    await wrapper.find('[data-test="register-email"] input').setValue('')
    await wrapper.find('[data-test="register-phone"] input').setValue('')
    await triggerBrowserSubmit(wrapper)

    expect(registerMock).toHaveBeenCalledOnce()
  })
})
