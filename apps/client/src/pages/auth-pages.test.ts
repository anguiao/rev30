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
import LoginPage from './login.vue'
import { login } from '../auth/requests'

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

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<main>Home</main>' } },
      { path: '/login', component: LoginPage },
      { path: '/register', component: { template: '<main>Register</main>' } },
    ],
  })
}

async function mountLoginPage() {
  const pinia = createPinia()
  setActivePinia(pinia)

  const router = createTestRouter()
  await router.push('/login')
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

describe('auth pages', () => {
  beforeEach(() => {
    loginMock.mockReset()
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
    await wrapper.find('[data-test="login-submit"]').trigger('click')
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
})
