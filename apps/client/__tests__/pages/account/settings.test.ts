import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@rev30/contracts'
import { h } from 'vue'
import { useAuthStore } from '../../../src/stores/auth'
import { updateMyPassword, updateMyProfile } from '../../../src/features/auth/requests'
import AccountSettingsPage from '../../../src/pages/account/settings.vue'
import {
  disposeActiveTestPinia,
  mountAuthRoute,
  session,
  stubPreferredDark,
} from '../../helpers/auth'
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
  getAuthErrorMessage: (error: unknown, fallback: string) =>
    error instanceof MockAuthRequestError ? error.message : fallback,
  updateMyPassword: vi.fn(),
  updateMyProfile: vi.fn(),
}))

vi.mock('@iconify/vue', () => ({
  Icon: {
    name: 'Icon',
    props: {
      icon: {
        type: String,
        required: true,
      },
    },
    setup(props: { icon: string }) {
      return () => h('span', { 'data-test': 'menu-icon' }, props.icon)
    },
  },
}))

const updateMyProfileMock = vi.mocked(updateMyProfile)
const updateMyPasswordMock = vi.mocked(updateMyPassword)

async function mountAccountSettingsPage() {
  return mountAuthRoute(
    '/account/settings',
    [
      { path: '/', component: { template: '<main>Home</main>' } },
      { path: '/account/settings', component: AccountSettingsPage },
    ],
    session,
  )
}

async function submitForm(
  wrapper: Awaited<ReturnType<typeof mountAccountSettingsPage>>['wrapper'],
  formSelector: string,
  submitSelector: string,
) {
  await wrapper.get(submitSelector).trigger('click')
  await wrapper.get(formSelector).trigger('submit')
  await flushPromises()
}

describe('account settings page', () => {
  beforeEach(() => {
    updateMyProfileMock.mockReset()
    updateMyPasswordMock.mockReset()
    localStorage.clear()
    document.documentElement.className = ''
    document.documentElement.style.colorScheme = ''
    stubPreferredDark(false)
  })

  afterEach(() => {
    disposeActiveTestPinia()
    vi.unstubAllGlobals()
  })

  it('updates my profile, refreshes the auth user, and renders the new nickname', async () => {
    const updatedUser: User = {
      ...session.user,
      nickname: 'Ada Byron',
      email: 'ada@example.com',
      phone: '18888888888',
      updatedAt: '2026-05-02T00:00:00.000Z',
    }
    updateMyProfileMock.mockResolvedValue(updatedUser)
    const { wrapper } = await mountAccountSettingsPage()
    const auth = useAuthStore()

    await wrapper.find('[data-test="account-profile-nickname"] input').setValue('Ada Byron')
    await wrapper.find('[data-test="account-profile-email"] input').setValue('ada@example.com')
    await wrapper.find('[data-test="account-profile-phone"] input').setValue('18888888888')
    await submitForm(
      wrapper,
      '[data-test="account-profile-form"]',
      '[data-test="account-profile-submit"]',
    )

    expect(updateMyProfileMock).toHaveBeenCalledOnce()
    expect(updateMyProfileMock).toHaveBeenCalledWith({
      nickname: 'Ada Byron',
      email: 'ada@example.com',
      phone: '18888888888',
    })
    expect(auth.user).toEqual(updatedUser)
    expect(wrapper.get('[data-test="admin-sidebar-user"]').text()).toContain('Ada Byron')
    expect(
      (wrapper.get('[data-test="account-profile-nickname"] input').element as HTMLInputElement)
        .value,
    ).toBe('Ada Byron')
    expect(document.body.textContent).toContain('保存个人信息成功')
  })

  it('shows unsupported profile field errors as a global error', async () => {
    updateMyProfileMock.mockRejectedValue(
      new MockAuthRequestError(400, '用户名不可修改', 'username'),
    )
    const { wrapper } = await mountAccountSettingsPage()

    await wrapper.find('[data-test="account-profile-nickname"] input').setValue('Ada Byron')
    await submitForm(
      wrapper,
      '[data-test="account-profile-form"]',
      '[data-test="account-profile-submit"]',
    )

    const nicknameFormItem = wrapper
      .get('[data-test="account-profile-nickname"]')
      .element.closest('.n-form-item')
    const emailFormItem = wrapper
      .get('[data-test="account-profile-email"]')
      .element.closest('.n-form-item')
    const phoneFormItem = wrapper
      .get('[data-test="account-profile-phone"]')
      .element.closest('.n-form-item')

    expect(updateMyProfileMock).toHaveBeenCalledOnce()
    expect(wrapper.find('.n-alert').text()).toContain('用户名不可修改')
    expect(nicknameFormItem?.textContent).not.toContain('用户名不可修改')
    expect(emailFormItem?.textContent).not.toContain('用户名不可修改')
    expect(phoneFormItem?.textContent).not.toContain('用户名不可修改')
  })

  it('renders a field error on current password failures', async () => {
    updateMyPasswordMock.mockRejectedValue(
      new MockAuthRequestError(400, '当前密码错误', 'currentPassword'),
    )
    const { wrapper } = await mountAccountSettingsPage()

    await wrapper.find('[data-test="account-password-current"] input').setValue('password123')
    await wrapper.find('[data-test="account-password-new"] input').setValue('password456')
    await wrapper.find('[data-test="account-password-confirm"] input').setValue('password456')
    await submitForm(
      wrapper,
      '[data-test="account-password-form"]',
      '[data-test="account-password-submit"]',
    )

    const currentPasswordFormItem = wrapper
      .get('[data-test="account-password-current"]')
      .element.closest('.n-form-item')
    const newPasswordFormItem = wrapper
      .get('[data-test="account-password-new"]')
      .element.closest('.n-form-item')
    const confirmPasswordFormItem = wrapper
      .get('[data-test="account-password-confirm"]')
      .element.closest('.n-form-item')

    expect(updateMyPasswordMock).toHaveBeenCalledOnce()
    expect(currentPasswordFormItem?.textContent).toContain('当前密码错误')
    expect(wrapper.find('.n-alert').exists()).toBe(false)
    expect(newPasswordFormItem?.textContent).not.toContain('当前密码错误')
    expect(confirmPasswordFormItem?.textContent).not.toContain('当前密码错误')
  })

  it('blocks password submission when the confirmation password does not match', async () => {
    const { wrapper } = await mountAccountSettingsPage()

    await wrapper.find('[data-test="account-password-current"] input').setValue('password123')
    await wrapper.find('[data-test="account-password-new"] input').setValue('password456')
    await wrapper.find('[data-test="account-password-confirm"] input').setValue('password789')
    await submitForm(
      wrapper,
      '[data-test="account-password-form"]',
      '[data-test="account-password-submit"]',
    )

    expect(updateMyPasswordMock).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('两次输入的密码不一致')
  })

  it('clears password fields after a successful password update', async () => {
    updateMyPasswordMock.mockResolvedValue(undefined)
    const { wrapper } = await mountAccountSettingsPage()

    await wrapper.find('[data-test="account-password-current"] input').setValue('password123')
    await wrapper.find('[data-test="account-password-new"] input').setValue('password456')
    await wrapper.find('[data-test="account-password-confirm"] input').setValue('password456')
    await submitForm(
      wrapper,
      '[data-test="account-password-form"]',
      '[data-test="account-password-submit"]',
    )

    expect(updateMyPasswordMock).toHaveBeenCalledWith({
      currentPassword: 'password123',
      newPassword: 'password456',
    })
    expect(
      (wrapper.get('[data-test="account-password-current"] input').element as HTMLInputElement)
        .value,
    ).toBe('')
    expect(
      (wrapper.get('[data-test="account-password-new"] input').element as HTMLInputElement).value,
    ).toBe('')
    expect(
      (wrapper.get('[data-test="account-password-confirm"] input').element as HTMLInputElement)
        .value,
    ).toBe('')
    expect(document.body.textContent).toContain('修改密码成功')
  })
})
