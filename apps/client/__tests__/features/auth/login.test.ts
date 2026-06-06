import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../../src/stores/auth'
import { login } from '../../../src/features/auth/requests'
import LoginPage from '../../../src/pages/login.vue'
import { ApiRequestError } from '../../../src/utils/request'
import {
  disposeActiveTestPinia,
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

  it('falls back home after login when the redirect target is unsafe', async () => {
    loginMock.mockResolvedValue(session)
    const { router, wrapper } = await mountLoginPage('/login?redirect=//evil.example/system')

    await wrapper.find('[data-test="login-username"] input').setValue('ada')
    await wrapper.find('[data-test="login-password"] input').setValue('password123')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(router.currentRoute.value.fullPath).toBe('/')
  })

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

  it('shows the server message for login rate limit errors', async () => {
    loginMock.mockRejectedValue(new ApiRequestError(429, '登录失败次数过多，请稍后再试'))
    const { router, wrapper } = await mountLoginPage()

    await wrapper.find('[data-test="login-username"] input').setValue('ada')
    await wrapper.find('[data-test="login-password"] input').setValue('password123')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const auth = useAuthStore()
    expect(loginMock).toHaveBeenCalledOnce()
    expect(auth.isAuthenticated).toBe(false)
    expect(router.currentRoute.value.fullPath).toBe('/login')
    expect(wrapper.text()).toContain('登录失败次数过多，请稍后再试')
  })

  it('shows a plain error message for unexpected login failures', async () => {
    loginMock.mockRejectedValue(new Error('network'))
    const { wrapper } = await mountLoginPage()

    await wrapper.find('[data-test="login-username"] input').setValue('ada')
    await wrapper.find('[data-test="login-password"] input').setValue('password123')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(loginMock).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('network')
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
