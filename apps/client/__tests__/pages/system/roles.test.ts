// @vitest-environment happy-dom

import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NPagination, NSelect } from 'naive-ui'
import { ROLE_STATUS_DISABLED, ROLE_STATUS_ENABLED, type RoleListResponse } from '@rev30/shared'
import { formatDateTime, listRoles } from '../../../src/features/system'
import RolesPage from '../../../src/pages/index/system/roles.vue'
import {
  disposeActiveTestPinia,
  mountAuthRoute,
  session,
  stubPreferredDark,
} from '../../helpers/auth'

enableAutoUnmount(afterEach)

vi.mock('../../../src/features/system', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/system')>()),
  listRoles: vi.fn(),
  getSystemErrorMessage: vi.fn((error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
  ),
}))

const listRolesMock = vi.mocked(listRoles)

const roleListResponse: RoleListResponse = {
  list: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      name: '管理员',
      code: 'admin',
      status: ROLE_STATUS_ENABLED,
      userCount: 12,
      sortOrder: 1,
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
    },
    {
      id: '22222222-2222-4111-9111-111111111112',
      name: '审计员',
      code: 'auditor',
      status: ROLE_STATUS_DISABLED,
      userCount: 3,
      sortOrder: 2,
      createdAt: '2026-05-02T00:00:00.000Z',
      updatedAt: '2026-05-02T00:00:00.000Z',
    },
  ],
  total: 2,
  page: 1,
  pageSize: 20,
}

async function mountRolesPage(accessCodes: string[] = session.accessCodes) {
  return mountAuthRoute('/system/roles', [{ path: '/system/roles', component: RolesPage }], {
    ...session,
    accessCodes,
  })
}

describe('roles page', () => {
  beforeEach(() => {
    listRolesMock.mockReset()
    localStorage.clear()
    document.documentElement.className = ''
    document.documentElement.style.colorScheme = ''
    stubPreferredDark(false)
  })

  afterEach(() => {
    disposeActiveTestPinia()
    vi.unstubAllGlobals()
  })

  it('loads and renders roles', async () => {
    listRolesMock.mockResolvedValue(roleListResponse)
    const { wrapper } = await mountRolesPage()
    await flushPromises()

    expect(listRolesMock).toHaveBeenCalledWith({ page: 1, pageSize: 20 })
    expect(wrapper.text()).toContain('角色管理')
    expect(wrapper.text()).toContain('共 2 个角色')
    expect(wrapper.text()).toContain('管理员')
    expect(wrapper.text()).toContain('admin')
    expect(wrapper.text()).toContain('审计员')
    expect(wrapper.text()).toContain('auditor')
    expect(wrapper.text()).toContain(formatDateTime('2026-05-01T00:00:00.000Z'))
    expect(wrapper.text()).toContain(formatDateTime('2026-05-02T00:00:00.000Z'))
    expect(wrapper.text()).toContain('12')
    expect(wrapper.text()).toContain('3')
    expect(wrapper.text()).toContain('1')
  })

  it('shows the refresh button only when the user has list permission', async () => {
    listRolesMock.mockResolvedValue(roleListResponse)
    const { wrapper: unauthorizedWrapper } = await mountRolesPage([])
    await flushPromises()

    expect(unauthorizedWrapper.find('[data-test="roles-refresh"]').exists()).toBe(false)

    const { wrapper: authorizedWrapper } = await mountRolesPage(['system:role:list'])
    await flushPromises()

    expect(authorizedWrapper.find('[data-test="roles-refresh"]').exists()).toBe(true)
  })

  it('submits keyword and status filters from page one', async () => {
    listRolesMock.mockResolvedValue(roleListResponse)
    const { wrapper } = await mountRolesPage()
    await flushPromises()

    await wrapper.find('[data-test="roles-keyword"] input').setValue('  admin  ')
    wrapper.getComponent(NSelect).vm.$emit('update:value', ROLE_STATUS_DISABLED)
    await flushPromises()
    await wrapper.get('[data-test="roles-search"]').trigger('click')
    await flushPromises()

    expect(listRolesMock).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 20,
      keyword: 'admin',
      status: ROLE_STATUS_DISABLED,
    })
  })

  it('changes page without applying draft filters before search', async () => {
    listRolesMock.mockResolvedValue(roleListResponse)
    const { wrapper } = await mountRolesPage()
    await flushPromises()

    await wrapper.find('[data-test="roles-keyword"] input').setValue('  admin  ')
    await flushPromises()

    wrapper.getComponent(NPagination).vm.$emit('update:page', 2)
    await flushPromises()

    expect(listRolesMock).toHaveBeenLastCalledWith({
      page: 2,
      pageSize: 20,
    })
  })

  it('keeps applied filters when changing page after search', async () => {
    listRolesMock.mockResolvedValue(roleListResponse)
    const { wrapper } = await mountRolesPage()
    await flushPromises()

    await wrapper.find('[data-test="roles-keyword"] input').setValue('  admin  ')
    wrapper.getComponent(NSelect).vm.$emit('update:value', ROLE_STATUS_DISABLED)
    await flushPromises()
    await wrapper.get('[data-test="roles-search"]').trigger('click')
    await flushPromises()

    wrapper.getComponent(NPagination).vm.$emit('update:page', 2)
    await flushPromises()

    expect(listRolesMock).toHaveBeenLastCalledWith({
      page: 2,
      pageSize: 20,
      keyword: 'admin',
      status: ROLE_STATUS_DISABLED,
    })
  })
})
