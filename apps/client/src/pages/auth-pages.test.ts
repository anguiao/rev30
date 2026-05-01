// @vitest-environment happy-dom

import { PiniaColada } from '@pinia/colada'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthTokenResponse } from '@rev30/shared'
import { USER_STATUS_ENABLED } from '@rev30/shared'
import { useAuthStore } from '../stores/auth'
import HomePage from './index.vue'
import LoginPage from './login.vue'
import loginPageSource from './login.vue?raw'
import RegisterPage from './register.vue'
import registerPageSource from './register.vue?raw'
import { login, logout, register } from '../auth/requests'

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

vi.mock('../auth/requests', () => ({
  AuthRequestError: MockAuthRequestError,
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
}))

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

const loginMock = vi.mocked(login)
const logoutMock = vi.mocked(logout)
const registerMock = vi.mocked(register)

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: HomePage },
      { path: '/login', component: LoginPage },
      { path: '/register', component: RegisterPage },
    ],
  })
}

async function mountAuthPage(path: '/' | '/login' | '/register') {
  const pinia = createPinia()
  setActivePinia(pinia)

  const router = createTestRouter()
  await router.push(path)
  await router.isReady()

  const wrapper = mount(
    defineComponent({
      template: '<RouterView />',
    }),
    {
      global: {
        plugins: [pinia, PiniaColada, router],
      },
    },
  )

  return { router, wrapper }
}

async function mountHomePage() {
  return mountAuthPage('/')
}

async function mountLoginPage() {
  return mountAuthPage('/login')
}

async function mountRegisterPage() {
  return mountAuthPage('/register')
}

async function triggerBrowserSubmit(wrapper: ReturnType<typeof mount>) {
  const form = wrapper.find('form')

  await wrapper.find('[data-test$="-submit"]').trigger('click')
  await form.trigger('submit')
  await flushPromises()
}

describe('auth pages', () => {
  beforeEach(() => {
    loginMock.mockReset()
    logoutMock.mockReset()
    registerMock.mockReset()
  })

  it('shows the current user summary on the home page', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    useAuthStore().setSession(session)

    const wrapper = mount(HomePage, {
      global: {
        plugins: [pinia, PiniaColada],
      },
    })

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

  it('calls login once when the browser submits the login form from the submit button', async () => {
    loginMock.mockResolvedValue(session)
    const { wrapper } = await mountLoginPage()

    await wrapper.find('[data-test="login-username"] input').setValue('ada')
    await wrapper.find('[data-test="login-password"] input').setValue('password123')
    await triggerBrowserSubmit(wrapper)

    expect(loginMock).toHaveBeenCalledOnce()
  })

  it('keeps the login submit button as a submit-only trigger', () => {
    expect(loginPageSource).not.toContain('@click="form.handleSubmit()"')
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

  it('keeps the registration submit button as a submit-only trigger', () => {
    expect(registerPageSource).not.toContain('@click="form.handleSubmit()"')
  })
})
