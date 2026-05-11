// @vitest-environment happy-dom

import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NPagination, NSelect } from 'naive-ui'
import {
  USER_STATUS_DISABLED,
  USER_STATUS_ENABLED,
  type UserCreateResponse,
  type UserListResponse,
  type UserResetPasswordResponse,
} from '@rev30/shared'
import { defineComponent, h } from 'vue'
import {
  deleteUser,
  formatDateTime,
  listUsers,
  resetUserPassword,
} from '../../../src/features/system'
import UsersPage from '../../../src/pages/index/system/users.vue'
import {
  disposeActiveTestPinia,
  mountAuthRoute,
  session,
  stubPreferredDark,
} from '../../helpers/auth'

enableAutoUnmount(afterEach)

vi.mock('../../../src/features/system/UserFormDrawer.vue', () => ({
  default: defineComponent({
    name: 'UserFormDrawerStub',
    props: {
      show: {
        type: Boolean,
        required: true,
      },
      userId: {
        type: String,
        default: null,
      },
    },
    emits: ['update:show', 'saved'],
    setup(props) {
      return () =>
        h('div', {
          'data-show': String(props.show),
          'data-test': 'user-form-drawer',
          'data-user-id': props.userId ?? '',
        })
    },
  }),
}))

vi.mock('../../../src/features/system', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/system')>()),
  deleteUser: vi.fn(),
  listUsers: vi.fn(),
  resetUserPassword: vi.fn(),
  getSystemErrorMessage: vi.fn((error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
  ),
}))

const deleteUserMock = vi.mocked(deleteUser)
const listUsersMock = vi.mocked(listUsers)
const resetUserPasswordMock = vi.mocked(resetUserPassword)

const userListResponse: UserListResponse = {
  list: [
    {
      id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
      username: 'ada',
      nickname: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: null,
      status: USER_STATUS_ENABLED,
      builtIn: true,
      departments: [{ id: '11111111-1111-4111-8111-111111111111', name: '研发中心', code: 'eng' }],
      roles: [{ id: '22222222-2222-4222-8222-222222222222', name: '管理员', code: 'admin' }],
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
    },
    {
      id: '9f34c0b7-f7c0-4905-a7f5-3b6d2512f6b8',
      username: 'grace',
      nickname: 'Grace Hopper',
      email: null,
      phone: '13800138000',
      status: USER_STATUS_DISABLED,
      builtIn: false,
      departments: [
        { id: '31111111-1111-4111-8111-111111111111', name: '平台架构', code: 'arch' },
        { id: '41111111-1111-4111-8111-111111111111', name: '数据治理', code: 'data' },
        { id: '51111111-1111-4111-8111-111111111111', name: '安全运营', code: 'sec' },
      ],
      roles: [
        { id: '32222222-2222-4222-8222-222222222222', name: '审计员', code: 'audit' },
        { id: '42222222-2222-4222-8222-222222222222', name: '访客', code: 'guest' },
      ],
      createdAt: '2026-05-02T00:00:00.000Z',
      updatedAt: '2026-05-02T00:00:00.000Z',
    },
  ],
  total: 2,
  page: 1,
  pageSize: 20,
}

const userCreateResponse: UserCreateResponse = {
  user: {
    ...userListResponse.list[1]!,
    username: 'new-user',
    nickname: 'New User',
  },
  temporaryPassword: 'TempPass123',
}

const resetPasswordResponse: UserResetPasswordResponse = {
  userId: userListResponse.list[1]!.id,
  temporaryPassword: 'ResetPass123',
}

async function mountUsersPage(accessCodes: string[] = session.accessCodes) {
  return mountAuthRoute('/system/users', [{ path: '/system/users', component: UsersPage }], {
    ...session,
    accessCodes,
  })
}

function queryTemporaryPasswordDialog() {
  const dialogs = Array.from(document.body.querySelectorAll('.n-dialog')) as HTMLElement[]

  return (
    dialogs.find(
      (dialog) =>
        dialog.style.display !== 'none' && dialog.querySelector('[data-test="temporary-password"]'),
    ) ?? null
  )
}

function getTemporaryPasswordInput() {
  return queryTemporaryPasswordDialog()?.querySelector(
    '[data-test="temporary-password"] input',
  ) as HTMLInputElement | null
}

function getTemporaryPasswordButton(testId: string) {
  return document.body.querySelector(`[data-test="${testId}"]`) as HTMLButtonElement | null
}

function getTemporaryPasswordCloseButton() {
  return queryTemporaryPasswordDialog()?.querySelector('.n-dialog__close') as HTMLElement | null
}

describe('users page', () => {
  beforeEach(() => {
    deleteUserMock.mockReset()
    listUsersMock.mockReset()
    resetUserPasswordMock.mockReset()
    localStorage.clear()
    document.documentElement.className = ''
    document.documentElement.style.colorScheme = ''
    document.body.innerHTML = ''
    stubPreferredDark(false)
  })

  afterEach(() => {
    disposeActiveTestPinia()
    vi.unstubAllGlobals()
    Reflect.deleteProperty(navigator, 'clipboard')
  })

  it('loads and renders users with departments and roles', async () => {
    listUsersMock.mockResolvedValue(userListResponse)
    const { wrapper } = await mountUsersPage()
    await flushPromises()

    expect(listUsersMock).toHaveBeenCalledWith({ page: 1, pageSize: 20 })
    expect(wrapper.text()).toContain('用户管理')
    expect(wrapper.text()).toContain('共 2 个用户')
    expect(wrapper.text()).toContain('ada')
    expect(wrapper.text()).toContain('Ada Lovelace')
    expect(wrapper.text()).toContain('ada@example.com')
    expect(wrapper.text()).toContain('研发中心')
    expect(wrapper.text()).toContain('管理员')
    expect(wrapper.text()).toContain('grace')
    expect(wrapper.text()).toContain('Grace Hopper')
    expect(wrapper.text()).toContain('13800138000')
    expect(wrapper.text()).toContain('平台架构、数据治理等 3 个')
    expect(wrapper.text()).toContain('审计员、访客')
    expect(wrapper.text()).toContain(formatDateTime('2026-05-01T00:00:00.000Z'))
  })

  it('shows create and row actions according to permissions', async () => {
    listUsersMock.mockResolvedValue(userListResponse)
    const { wrapper: unauthorizedWrapper } = await mountUsersPage([])
    await flushPromises()

    expect(unauthorizedWrapper.find('[data-test="users-create"]').exists()).toBe(false)
    expect(unauthorizedWrapper.find('[data-test="users-edit"]').exists()).toBe(false)
    expect(unauthorizedWrapper.find('[data-test="users-delete"]').exists()).toBe(false)

    const { wrapper: insufficientPermissionWrapper } = await mountUsersPage(['system:user:update'])
    await flushPromises()

    expect(insufficientPermissionWrapper.find('[data-test="users-create"]').exists()).toBe(false)
    expect(insufficientPermissionWrapper.find('[data-test="users-edit"]').exists()).toBe(false)
    expect(insufficientPermissionWrapper.find('[data-test="users-delete"]').exists()).toBe(false)

    const { wrapper: createOnlyWrapper } = await mountUsersPage(['system:user:create'])
    await flushPromises()

    expect(createOnlyWrapper.find('[data-test="users-create"]').exists()).toBe(false)

    const { wrapper: authorizedWrapper } = await mountUsersPage([
      'system:user:create',
      'system:user:update',
      'system:user:delete',
      'system:user:reset-password',
      'system:user:list',
      'system:department:list',
      'system:role:list',
    ])
    await flushPromises()

    expect(authorizedWrapper.find('[data-test="users-create"]').exists()).toBe(true)
    expect(authorizedWrapper.findAll('[data-test="users-edit"]')).toHaveLength(1)
    expect(authorizedWrapper.findAll('[data-test="users-delete"]')).toHaveLength(1)
    expect(authorizedWrapper.findAll('[data-test="users-reset-password"]')).toHaveLength(1)
  })

  it('opens create drawer and refetches after saving with full permissions', async () => {
    listUsersMock.mockResolvedValue(userListResponse)
    const { wrapper } = await mountUsersPage([
      'system:user:create',
      'system:department:list',
      'system:role:list',
    ])
    await flushPromises()

    await wrapper.get('[data-test="users-create"]').trigger('click')
    await flushPromises()

    const drawer = wrapper.get('[data-test="user-form-drawer"]')
    expect(drawer.attributes('data-show')).toBe('true')
    expect(drawer.attributes('data-user-id')).toBe('')

    wrapper.getComponent({ name: 'UserFormDrawerStub' }).vm.$emit('saved', userCreateResponse)
    await flushPromises()

    expect(listUsersMock).toHaveBeenCalledTimes(2)
    expect(listUsersMock).toHaveBeenLastCalledWith({ page: 1, pageSize: 20 })
    expect(document.body.textContent).toContain('用户 New User 的临时密码只会显示一次。')
    expect(getTemporaryPasswordInput()).toHaveProperty('value', 'TempPass123')
  })

  it('closes temporary password dialog and opens a fresh one', async () => {
    listUsersMock.mockResolvedValue(userListResponse)
    const { wrapper } = await mountUsersPage([
      'system:user:create',
      'system:department:list',
      'system:role:list',
    ])
    await flushPromises()

    wrapper.getComponent({ name: 'UserFormDrawerStub' }).vm.$emit('saved', userCreateResponse)
    await flushPromises()

    expect(queryTemporaryPasswordDialog()).not.toBeNull()
    expect(getTemporaryPasswordInput()).toHaveProperty('value', 'TempPass123')

    const closeButton = getTemporaryPasswordCloseButton()
    expect(closeButton).not.toBeNull()

    closeButton?.click()
    await flushPromises()

    expect(queryTemporaryPasswordDialog()).toBeNull()

    wrapper.getComponent({ name: 'UserFormDrawerStub' }).vm.$emit('saved', {
      ...userCreateResponse,
      temporaryPassword: 'TempPass456',
    })
    await flushPromises()

    expect(getTemporaryPasswordInput()).toHaveProperty('value', 'TempPass456')
  })

  it('opens edit drawer with selected user id', async () => {
    const editableUser = userListResponse.list[1]!
    listUsersMock.mockResolvedValue(userListResponse)
    const { wrapper } = await mountUsersPage([
      'system:user:update',
      'system:user:list',
      'system:department:list',
      'system:role:list',
    ])
    await flushPromises()

    await wrapper.get('[data-test="users-edit"]').trigger('click')
    await flushPromises()

    const drawer = wrapper.get('[data-test="user-form-drawer"]')
    expect(drawer.attributes('data-show')).toBe('true')
    expect(drawer.attributes('data-user-id')).toBe(editableUser.id)
  })

  it('shows a success message and refreshes after the user drawer saves', async () => {
    listUsersMock.mockResolvedValue(userListResponse)
    const { wrapper } = await mountUsersPage([
      'system:user:update',
      'system:user:list',
      'system:department:list',
      'system:role:list',
    ])
    await flushPromises()

    await wrapper.get('[data-test="users-edit"]').trigger('click')
    await flushPromises()
    wrapper.getComponent({ name: 'UserFormDrawerStub' }).vm.$emit('saved')
    await flushPromises()

    expect(listUsersMock).toHaveBeenCalledTimes(2)
    expect(listUsersMock).toHaveBeenLastCalledWith({ page: 1, pageSize: 20 })
    expect(document.body.textContent).toContain('保存用户成功')
  })

  it('deletes a user after confirmation and refreshes the list', async () => {
    const deletableUser = userListResponse.list[1]!
    listUsersMock.mockResolvedValue(userListResponse)
    deleteUserMock.mockResolvedValue(undefined)

    const { wrapper } = await mountUsersPage(['system:user:delete'])
    await flushPromises()

    await wrapper.get('[data-test="users-delete"]').trigger('click')
    await flushPromises()

    const confirmButton = document.body.querySelector(
      '[data-test="users-delete-confirm"]',
    ) as HTMLButtonElement | null

    expect(confirmButton).not.toBeNull()

    confirmButton?.click()
    await flushPromises()

    expect(deleteUserMock).toHaveBeenCalledWith(deletableUser.id)
    expect(listUsersMock).toHaveBeenCalledTimes(2)
    expect(listUsersMock).toHaveBeenLastCalledWith({ page: 1, pageSize: 20 })
  })

  it('resets password after confirmation and shows the temporary password dialog', async () => {
    const resettableUser = userListResponse.list[1]!
    listUsersMock.mockResolvedValue(userListResponse)
    resetUserPasswordMock.mockResolvedValue(resetPasswordResponse)

    const { wrapper } = await mountUsersPage(['system:user:reset-password'])
    await flushPromises()

    await wrapper.get('[data-test="users-reset-password"]').trigger('click')
    await flushPromises()

    const confirmButton = document.body.querySelector(
      '[data-test="users-reset-password-confirm"]',
    ) as HTMLButtonElement | null

    expect(confirmButton).not.toBeNull()

    confirmButton?.click()
    await flushPromises()

    expect(resetUserPasswordMock).toHaveBeenCalledWith(resettableUser.id)
    expect(listUsersMock).toHaveBeenCalledTimes(1)
    expect(document.body.textContent).toContain('用户 Grace Hopper 的临时密码只会显示一次。')
    expect(getTemporaryPasswordInput()).toHaveProperty('value', 'ResetPass123')
  })

  it('shows copied state after copying the temporary password', async () => {
    class TestClipboardItem {
      constructor(readonly items: Record<string, unknown>) {}
    }

    const write = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('ClipboardItem', TestClipboardItem)
    Object.defineProperty(navigator, 'clipboard', {
      value: { write },
      configurable: true,
    })
    listUsersMock.mockResolvedValue(userListResponse)
    resetUserPasswordMock.mockResolvedValue(resetPasswordResponse)

    const { wrapper } = await mountUsersPage(['system:user:reset-password'])
    await flushPromises()

    await wrapper.get('[data-test="users-reset-password"]').trigger('click')
    await flushPromises()

    const confirmButton = document.body.querySelector(
      '[data-test="users-reset-password-confirm"]',
    ) as HTMLButtonElement | null

    confirmButton?.click()
    await flushPromises()

    const copyButton = getTemporaryPasswordButton('temporary-password-copy')
    expect(copyButton).not.toBeNull()

    copyButton?.click()
    await flushPromises()

    expect(write).toHaveBeenCalledTimes(1)
    const [clipboardItems] = write.mock.calls[0]!
    expect(clipboardItems).toHaveLength(1)
    expect((clipboardItems as TestClipboardItem[])[0]?.items).toHaveProperty(
      'text/plain',
      'ResetPass123',
    )
    expect(copyButton?.textContent).toContain('已复制')
  })

  it('keeps reset password dialog open when resetting password fails', async () => {
    listUsersMock.mockResolvedValue(userListResponse)
    resetUserPasswordMock.mockRejectedValue(new Error('重置失败'))

    const { wrapper } = await mountUsersPage(['system:user:reset-password'])
    await flushPromises()

    await wrapper.get('[data-test="users-reset-password"]').trigger('click')
    await flushPromises()

    const confirmButton = document.body.querySelector(
      '[data-test="users-reset-password-confirm"]',
    ) as HTMLButtonElement | null

    expect(confirmButton).not.toBeNull()

    confirmButton?.click()
    await flushPromises()

    expect(resetUserPasswordMock).toHaveBeenCalledWith(userListResponse.list[1]!.id)
    expect(listUsersMock).toHaveBeenCalledTimes(1)
    expect(document.body.querySelector('[data-test="users-reset-password-confirm"]')).not.toBeNull()
  })

  it('keeps delete dialog open when deleting user fails', async () => {
    deleteUserMock.mockRejectedValue(new Error('删除失败'))
    listUsersMock.mockResolvedValue(userListResponse)

    const { wrapper } = await mountUsersPage(['system:user:delete'])
    await flushPromises()

    await wrapper.get('[data-test="users-delete"]').trigger('click')
    await flushPromises()

    const confirmButton = document.body.querySelector(
      '[data-test="users-delete-confirm"]',
    ) as HTMLButtonElement | null

    expect(confirmButton).not.toBeNull()

    confirmButton?.click()
    await flushPromises()

    expect(deleteUserMock).toHaveBeenCalledWith(userListResponse.list[1]!.id)
    expect(listUsersMock).toHaveBeenCalledTimes(1)
    expect(document.body.querySelector('[data-test="users-delete-confirm"]')).not.toBeNull()
  })

  it('submits keyword and status filters from page one', async () => {
    listUsersMock.mockResolvedValue(userListResponse)
    const { wrapper } = await mountUsersPage()
    await flushPromises()

    await wrapper.find('[data-test="users-keyword"] input').setValue('  ada  ')
    wrapper.getComponent(NSelect).vm.$emit('update:value', USER_STATUS_DISABLED)
    await flushPromises()
    await wrapper.get('[data-test="users-search"]').trigger('click')
    await flushPromises()

    expect(listUsersMock).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 20,
      keyword: 'ada',
      status: USER_STATUS_DISABLED,
    })
  })

  it('changes page without applying draft filters before search', async () => {
    listUsersMock.mockResolvedValue(userListResponse)
    const { wrapper } = await mountUsersPage()
    await flushPromises()

    await wrapper.find('[data-test="users-keyword"] input').setValue('  ada  ')
    await flushPromises()

    wrapper.getComponent(NPagination).vm.$emit('update:page', 2)
    await flushPromises()

    expect(listUsersMock).toHaveBeenLastCalledWith({
      page: 2,
      pageSize: 20,
    })
  })

  it('keeps applied filters when changing page after search', async () => {
    listUsersMock.mockResolvedValue(userListResponse)
    const { wrapper } = await mountUsersPage()
    await flushPromises()

    await wrapper.find('[data-test="users-keyword"] input').setValue('  ada  ')
    wrapper.getComponent(NSelect).vm.$emit('update:value', USER_STATUS_DISABLED)
    await flushPromises()
    await wrapper.get('[data-test="users-search"]').trigger('click')
    await flushPromises()

    wrapper.getComponent(NPagination).vm.$emit('update:page', 2)
    await flushPromises()

    expect(listUsersMock).toHaveBeenLastCalledWith({
      page: 2,
      pageSize: 20,
      keyword: 'ada',
      status: USER_STATUS_DISABLED,
    })
  })
})
