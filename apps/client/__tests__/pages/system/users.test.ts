// @vitest-environment happy-dom

import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NPagination, NSelect } from 'naive-ui'
import { USER_STATUS_DISABLED, USER_STATUS_ENABLED, type UserListResponse } from '@rev30/shared'
import { formatDateTime, listUsers } from '../../../src/features/system'
import UsersPage from '../../../src/pages/index/system/users.vue'
import {
  disposeActiveTestPinia,
  mountAuthRoute,
  session,
  stubPreferredDark,
} from '../../helpers/auth'

enableAutoUnmount(afterEach)

vi.mock('../../../src/features/system', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/system')>()),
  listUsers: vi.fn(),
  getSystemErrorMessage: vi.fn((error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
  ),
}))

const listUsersMock = vi.mocked(listUsers)

const userListResponse: UserListResponse = {
  list: [
    {
      id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
      username: 'ada',
      nickname: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: null,
      status: USER_STATUS_ENABLED,
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

async function mountUsersPage(accessCodes: string[] = session.accessCodes) {
  return mountAuthRoute('/system/users', [{ path: '/system/users', component: UsersPage }], {
    ...session,
    accessCodes,
  })
}

describe('users page', () => {
  beforeEach(() => {
    listUsersMock.mockReset()
    localStorage.clear()
    document.documentElement.className = ''
    document.documentElement.style.colorScheme = ''
    stubPreferredDark(false)
  })

  afterEach(() => {
    disposeActiveTestPinia()
    vi.unstubAllGlobals()
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

    const { wrapper: authorizedWrapper } = await mountUsersPage([
      'system:user:create',
      'system:user:update',
      'system:user:delete',
    ])
    await flushPromises()

    expect(authorizedWrapper.find('[data-test="users-create"]').exists()).toBe(true)
    expect(authorizedWrapper.find('[data-test="users-edit"]').exists()).toBe(true)
    expect(authorizedWrapper.find('[data-test="users-delete"]').exists()).toBe(true)
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
