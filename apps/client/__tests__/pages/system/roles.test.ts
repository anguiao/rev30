import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NPagination, NSelect } from 'naive-ui'
import {
  BUILT_IN_ADMIN_ROLE_CODE,
  ROLE_STATUS_DISABLED,
  ROLE_STATUS_ENABLED,
  type RoleListResponse,
} from '@rev30/shared'
import { defineComponent, h } from 'vue'
import {
  deleteRole,
  formatDateTime,
  listRoles,
  SystemRequestError,
} from '../../../src/features/system'
import RolesPage from '../../../src/pages/index/system/roles.vue'
import {
  disposeActiveTestPinia,
  mountAuthRoute,
  session,
  stubPreferredDark,
} from '../../helpers/auth'
vi.mock('../../../src/features/system/RoleFormDrawer.vue', () => ({
  default: defineComponent({
    name: 'RoleFormDrawerStub',
    props: {
      show: {
        type: Boolean,
        required: true,
      },
      roleId: {
        type: String,
        default: null,
      },
    },
    emits: ['update:show', 'saved'],
    setup(props) {
      return () =>
        h('div', {
          'data-role-id': props.roleId ?? '',
          'data-show': String(props.show),
          'data-test': 'role-form-drawer',
        })
    },
  }),
}))

vi.mock('../../../src/features/system', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/system')>()),
  deleteRole: vi.fn(),
  listRoles: vi.fn(),
}))

const deleteRoleMock = vi.mocked(deleteRole)
const listRolesMock = vi.mocked(listRoles)

const roleListResponse: RoleListResponse = {
  list: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      name: '管理员',
      code: BUILT_IN_ADMIN_ROLE_CODE,
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

const paginatedRoleListResponse: RoleListResponse = {
  ...roleListResponse,
  total: 21,
}

async function mountRolesPage(accessCodes: string[] = session.accessCodes) {
  return mountAuthRoute('/system/roles', [{ path: '/system/roles', component: RolesPage }], {
    ...session,
    accessCodes,
  })
}

describe('roles page', () => {
  beforeEach(() => {
    deleteRoleMock.mockReset()
    listRolesMock.mockReset()
    localStorage.clear()
    document.documentElement.className = ''
    document.documentElement.style.colorScheme = ''
    document.body.innerHTML = ''
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
    expect(wrapper.text()).toContain('系统角色')
    expect(wrapper.text()).toContain('共 2 个')
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

  it('shows a server load error when roles cannot be loaded', async () => {
    listRolesMock.mockRejectedValue(new SystemRequestError(500, '加载角色列表失败'))
    const { wrapper } = await mountRolesPage()
    await flushPromises()

    expect(listRolesMock).toHaveBeenCalledWith({ page: 1, pageSize: 20 })
    expect(wrapper.text()).toContain('加载角色列表失败')
  })

  it('shows a fallback load error for unexpected role load errors', async () => {
    listRolesMock.mockRejectedValue(new Error('network down'))
    const { wrapper } = await mountRolesPage()
    await flushPromises()

    expect(listRolesMock).toHaveBeenCalledWith({ page: 1, pageSize: 20 })
    expect(wrapper.text()).toContain('加载系统角色失败')
    expect(wrapper.text()).not.toContain('network down')
  })

  it('shows create and row actions according to permissions', async () => {
    listRolesMock.mockResolvedValue(roleListResponse)
    const { wrapper: unauthorizedWrapper } = await mountRolesPage([])
    await flushPromises()

    expect(unauthorizedWrapper.find('[data-test="roles-create"]').exists()).toBe(false)
    expect(unauthorizedWrapper.find('[data-test="roles-edit"]').exists()).toBe(false)
    expect(unauthorizedWrapper.find('[data-test="roles-delete"]').exists()).toBe(false)

    const { wrapper: insufficientPermissionWrapper } = await mountRolesPage([
      'system:role:create',
      'system:role:update',
      'system:role:delete',
    ])
    await flushPromises()

    expect(insufficientPermissionWrapper.find('[data-test="roles-create"]').exists()).toBe(false)
    expect(insufficientPermissionWrapper.find('[data-test="roles-edit"]').exists()).toBe(false)
    expect(insufficientPermissionWrapper.findAll('[data-test="roles-delete"]')).toHaveLength(1)

    const { wrapper: authorizedWrapper } = await mountRolesPage([
      'system:role:create',
      'system:resource:list',
      'system:role:update',
      'system:role:list',
      'system:role:delete',
    ])
    await flushPromises()

    expect(authorizedWrapper.find('[data-test="roles-create"]').exists()).toBe(true)
    expect(authorizedWrapper.findAll('[data-test="roles-edit"]')).toHaveLength(1)
    expect(authorizedWrapper.findAll('[data-test="roles-delete"]')).toHaveLength(1)
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
    listRolesMock.mockResolvedValue(paginatedRoleListResponse)
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
    listRolesMock.mockResolvedValue(paginatedRoleListResponse)
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

  it('resets keyword and status filters back to the first page', async () => {
    listRolesMock.mockResolvedValue(paginatedRoleListResponse)
    const { wrapper } = await mountRolesPage()
    await flushPromises()

    await wrapper.find('[data-test="roles-keyword"] input').setValue('admin')
    wrapper.getComponent(NSelect).vm.$emit('update:value', ROLE_STATUS_DISABLED)
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

    const resetButton = wrapper
      .findAll('button')
      .find((buttonWrapper) => buttonWrapper.text() === '重置')
    expect(resetButton).toBeDefined()
    await resetButton!.trigger('click')
    await flushPromises()

    expect(
      (wrapper.get('[data-test="roles-keyword"] input').element as HTMLInputElement).value,
    ).toBe('')

    wrapper.getComponent(NPagination).vm.$emit('update:page', 2)
    await flushPromises()

    expect(listRolesMock).toHaveBeenLastCalledWith({ page: 2, pageSize: 20 })
  })

  it('opens create drawer when clicking create button', async () => {
    listRolesMock.mockResolvedValue(roleListResponse)
    const { wrapper } = await mountRolesPage(['system:role:create', 'system:resource:list'])
    await flushPromises()

    await wrapper.get('[data-test="roles-create"]').trigger('click')
    await flushPromises()

    const drawer = wrapper.get('[data-test="role-form-drawer"]')
    expect(drawer.attributes('data-show')).toBe('true')
    expect(drawer.attributes('data-role-id')).toBe('')
  })

  it('shows a success message and refreshes after the role drawer saves', async () => {
    listRolesMock.mockResolvedValue(roleListResponse)
    const { wrapper } = await mountRolesPage(['system:role:create', 'system:resource:list'])
    await flushPromises()

    await wrapper.get('[data-test="roles-create"]').trigger('click')
    await flushPromises()
    wrapper.getComponent({ name: 'RoleFormDrawerStub' }).vm.$emit('saved')
    await flushPromises()

    expect(listRolesMock).toHaveBeenCalledTimes(2)
    expect(listRolesMock).toHaveBeenLastCalledWith({ page: 1, pageSize: 20 })
    expect(document.body.textContent).toContain('保存系统角色成功')
  })

  it('opens edit drawer with selected role id', async () => {
    const editableRole = roleListResponse.list[1]!
    listRolesMock.mockResolvedValue(roleListResponse)
    const { wrapper } = await mountRolesPage([
      'system:role:update',
      'system:role:list',
      'system:resource:list',
    ])
    await flushPromises()

    await wrapper.get('[data-test="roles-edit"]').trigger('click')
    await flushPromises()

    const drawer = wrapper.get('[data-test="role-form-drawer"]')
    expect(drawer.attributes('data-show')).toBe('true')
    expect(drawer.attributes('data-role-id')).toBe(editableRole.id)
  })

  it('deletes a role after confirmation and refreshes the list', async () => {
    const deletableRole = roleListResponse.list[1]!
    listRolesMock.mockResolvedValue(roleListResponse)
    deleteRoleMock.mockResolvedValue(undefined)

    const { wrapper } = await mountRolesPage(['system:role:delete'])
    await flushPromises()

    await wrapper.get('[data-test="roles-delete"]').trigger('click')
    await flushPromises()

    const confirmButton = document.body.querySelector(
      '[data-test="roles-delete-confirm"]',
    ) as HTMLButtonElement | null

    expect(confirmButton).not.toBeNull()

    confirmButton?.click()
    await flushPromises()

    expect(deleteRoleMock).toHaveBeenCalledWith(deletableRole.id)
    expect(listRolesMock).toHaveBeenCalledTimes(2)
    expect(listRolesMock).toHaveBeenLastCalledWith({ page: 1, pageSize: 20 })
  })

  it('keeps delete dialog open when deleting role fails', async () => {
    deleteRoleMock.mockRejectedValue(new Error('删除失败'))
    listRolesMock.mockResolvedValue(roleListResponse)

    const { wrapper } = await mountRolesPage(['system:role:delete'])
    await flushPromises()

    await wrapper.get('[data-test="roles-delete"]').trigger('click')
    await flushPromises()

    const confirmButton = document.body.querySelector(
      '[data-test="roles-delete-confirm"]',
    ) as HTMLButtonElement | null

    expect(confirmButton).not.toBeNull()

    confirmButton?.click()
    await flushPromises()

    expect(deleteRoleMock).toHaveBeenCalledWith(roleListResponse.list[1]!.id)
    expect(listRolesMock).toHaveBeenCalledTimes(1)
    expect(document.body.querySelector('[data-test="roles-delete-confirm"]')).not.toBeNull()
  })
})
