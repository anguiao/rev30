import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { NDataTable, NPagination, NSelect } from 'naive-ui'
import {
  DEPARTMENT_STATUS_DISABLED,
  DEPARTMENT_STATUS_ENABLED,
  type DepartmentTreeNode,
} from '@rev30/contracts'
import { formatDisplayDateTime } from '@rev30/utils'
import {
  deleteDepartment,
  getDepartmentTree,
  SystemRequestError,
} from '../../../src/features/system'
import DepartmentsPage from '../../../src/pages/index/system/departments.vue'
import {
  disposeActiveTestPinia,
  mountAuthRoute,
  session,
  stubPreferredDark,
} from '../../helpers/auth'
vi.mock('../../../src/features/system/DepartmentFormDrawer.vue', () => ({
  default: defineComponent({
    name: 'DepartmentFormDrawerStub',
    props: {
      show: { type: Boolean, required: true },
      departmentId: { type: String, default: null },
      parentId: { type: String, default: null },
    },
    emits: ['update:show', 'saved'],
    setup(props) {
      return () =>
        h('div', {
          'data-department-id': props.departmentId ?? '',
          'data-parent-id': props.parentId ?? '',
          'data-show': String(props.show),
          'data-test': 'department-form-drawer',
        })
    },
  }),
}))

vi.mock('../../../src/features/system', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/system')>()),
  deleteDepartment: vi.fn(),
  getDepartmentTree: vi.fn(),
}))

const deleteDepartmentMock = vi.mocked(deleteDepartment)
const getDepartmentTreeMock = vi.mocked(getDepartmentTree)

const departmentTreeResponse: DepartmentTreeNode[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    parentId: null,
    name: '研发中心',
    code: 'ENG',
    status: DEPARTMENT_STATUS_ENABLED,
    sortOrder: 1,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    children: [
      {
        id: '22222222-2222-4222-8222-222222222222',
        parentId: '11111111-1111-4111-8111-111111111111',
        name: '平台架构组',
        code: 'ARCH',
        status: DEPARTMENT_STATUS_DISABLED,
        sortOrder: 2,
        createdAt: '2026-05-02T00:00:00.000Z',
        updatedAt: '2026-05-02T00:00:00.000Z',
        children: [],
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        parentId: '11111111-1111-4111-8111-111111111111',
        name: '前端组',
        code: 'WEB',
        status: DEPARTMENT_STATUS_ENABLED,
        sortOrder: 3,
        createdAt: '2026-05-03T00:00:00.000Z',
        updatedAt: '2026-05-03T00:00:00.000Z',
        children: [],
      },
    ],
  },
]

async function mountDepartmentsPage(accessCodes: string[] = session.accessCodes) {
  return mountAuthRoute(
    '/system/departments',
    [{ path: '/system/departments', component: DepartmentsPage }],
    {
      ...session,
      accessCodes,
    },
  )
}

describe('departments page', () => {
  beforeEach(() => {
    deleteDepartmentMock.mockReset()
    getDepartmentTreeMock.mockReset()
    localStorage.clear()
    document.documentElement.className = ''
    document.documentElement.style.colorScheme = ''
    stubPreferredDark(false)
  })

  afterEach(() => {
    disposeActiveTestPinia()
    vi.unstubAllGlobals()
  })

  it('loads and renders a department tree without pagination', async () => {
    const architectureChild = departmentTreeResponse[0]!.children[0]!
    getDepartmentTreeMock.mockResolvedValue([
      {
        ...departmentTreeResponse[0]!,
        children: [architectureChild],
      },
    ])
    const { wrapper } = await mountDepartmentsPage()
    await flushPromises()

    expect(getDepartmentTreeMock).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('组织部门')
    expect(wrapper.text()).toContain('共 2 个')
    expect(wrapper.text()).toContain('研发中心')
    expect(wrapper.text()).toContain('ENG')
    expect(wrapper.text()).toContain(formatDisplayDateTime('2026-05-01T00:00:00.000Z'))
    const table = wrapper.getComponent(NDataTable)
    const treeData = table.props('data') as DepartmentTreeNode[]
    expect(treeData).toHaveLength(1)
    expect(treeData[0]!.children).toHaveLength(1)
    expect(treeData[0]!.children[0]!.name).toBe('平台架构组')
    expect(treeData[0]!.children[0]!.code).toBe('ARCH')
    expect(table.props('expandedRowKeys')).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ])
    table.vm.$emit('update:expandedRowKeys', [])
    await flushPromises()
    expect(wrapper.getComponent(NDataTable).props('expandedRowKeys')).toEqual([])
    expect(formatDisplayDateTime(treeData[0]!.children[0]!.createdAt)).toBe(
      formatDisplayDateTime('2026-05-02T00:00:00.000Z'),
    )
    expect(wrapper.findComponent(NPagination).exists()).toBe(false)
  })

  it('shows a server load error when departments cannot be loaded', async () => {
    getDepartmentTreeMock.mockRejectedValue(new SystemRequestError(500, '加载部门树失败'))
    const { wrapper } = await mountDepartmentsPage()
    await flushPromises()

    expect(getDepartmentTreeMock).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('加载部门树失败')
  })

  it('shows a fallback load error for unexpected department load errors', async () => {
    getDepartmentTreeMock.mockRejectedValue(new Error('network down'))
    const { wrapper } = await mountDepartmentsPage()
    await flushPromises()

    expect(getDepartmentTreeMock).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('加载组织部门失败')
    expect(wrapper.text()).not.toContain('network down')
  })

  it('shows create and row actions according to permissions', async () => {
    getDepartmentTreeMock.mockResolvedValue(departmentTreeResponse)
    const { wrapper: unauthorizedWrapper } = await mountDepartmentsPage([])
    await flushPromises()

    expect(unauthorizedWrapper.find('[data-test="departments-create"]').exists()).toBe(false)
    expect(unauthorizedWrapper.find('[data-test="departments-create-child"]').exists()).toBe(false)
    expect(unauthorizedWrapper.find('[data-test="departments-edit"]').exists()).toBe(false)
    expect(unauthorizedWrapper.find('[data-test="departments-delete"]').exists()).toBe(false)

    const { wrapper: authorizedWrapper } = await mountDepartmentsPage([
      'system:department:create',
      'system:department:update',
      'system:department:list',
      'system:department:delete',
    ])
    await flushPromises()

    expect(authorizedWrapper.find('[data-test="departments-create"]').exists()).toBe(true)
    expect(authorizedWrapper.find('[data-test="departments-create-child"]').exists()).toBe(true)
    expect(authorizedWrapper.find('[data-test="departments-edit"]').exists()).toBe(true)
    expect(authorizedWrapper.find('[data-test="departments-delete"]').exists()).toBe(true)
  })

  it('opens create, child create, and edit drawers', async () => {
    getDepartmentTreeMock.mockResolvedValue(departmentTreeResponse)
    const { wrapper } = await mountDepartmentsPage([
      'system:department:create',
      'system:department:update',
      'system:department:list',
    ])
    await flushPromises()

    const drawer = wrapper.get('[data-test="department-form-drawer"]')
    expect(drawer.attributes('data-show')).toBe('false')
    expect(drawer.attributes('data-department-id')).toBe('')
    expect(drawer.attributes('data-parent-id')).toBe('')

    await wrapper.get('[data-test="departments-create"]').trigger('click')
    await flushPromises()

    expect(drawer.attributes('data-show')).toBe('true')
    expect(drawer.attributes('data-department-id')).toBe('')
    expect(drawer.attributes('data-parent-id')).toBe('')

    await wrapper.get('[data-test="departments-create-child"]').trigger('click')
    await flushPromises()

    expect(drawer.attributes('data-show')).toBe('true')
    expect(drawer.attributes('data-department-id')).toBe('')
    expect(drawer.attributes('data-parent-id')).toBe(departmentTreeResponse[0]!.id)

    await wrapper.get('[data-test="departments-edit"]').trigger('click')
    await flushPromises()

    expect(drawer.attributes('data-show')).toBe('true')
    expect(drawer.attributes('data-department-id')).toBe(departmentTreeResponse[0]!.id)
    expect(drawer.attributes('data-parent-id')).toBe('')
  })

  it('shows a success message and refreshes after drawer saves', async () => {
    getDepartmentTreeMock.mockResolvedValue(departmentTreeResponse)
    const { wrapper } = await mountDepartmentsPage([
      'system:department:create',
      'system:department:list',
    ])
    await flushPromises()

    await wrapper.get('[data-test="departments-create"]').trigger('click')
    await flushPromises()
    await wrapper.getComponent({ name: 'DepartmentFormDrawerStub' }).vm.$emit('saved')
    await flushPromises()

    expect(getDepartmentTreeMock).toHaveBeenCalledTimes(2)
    expect(document.body.textContent).toContain('保存组织部门成功')
  })

  it('disables row delete when a department has children', async () => {
    getDepartmentTreeMock.mockResolvedValue(departmentTreeResponse)
    const { wrapper } = await mountDepartmentsPage(['system:department:delete'])
    await flushPromises()

    const deleteButtons = wrapper.findAll('[data-test="departments-delete"]')
    expect(deleteButtons).toHaveLength(3)
    expect(deleteButtons[0]!.attributes('disabled')).toBeDefined()

    await deleteButtons[0]!.trigger('click')
    await flushPromises()

    expect(document.body.querySelector('[data-test="departments-delete-confirm"]')).toBeNull()
    expect(deleteDepartmentMock).not.toHaveBeenCalled()
  })

  it('keeps delete disabled for filtered departments with hidden children', async () => {
    getDepartmentTreeMock.mockResolvedValue(departmentTreeResponse)
    const { wrapper } = await mountDepartmentsPage(['system:department:delete'])
    await flushPromises()

    await wrapper.find('[data-test="departments-keyword"] input').setValue('eng')
    await wrapper.get('[data-test="departments-search"]').trigger('click')
    await flushPromises()

    const tableData = wrapper.getComponent(NDataTable).props('data') as DepartmentTreeNode[]
    expect(tableData).toHaveLength(1)
    expect(tableData[0]!.children).toEqual([])

    const deleteButtons = wrapper.findAll('[data-test="departments-delete"]')
    expect(deleteButtons).toHaveLength(1)
    expect(deleteButtons[0]!.attributes('disabled')).toBeDefined()

    await deleteButtons[0]!.trigger('click')
    await flushPromises()

    expect(document.body.querySelector('[data-test="departments-delete-confirm"]')).toBeNull()
    expect(deleteDepartmentMock).not.toHaveBeenCalled()
  })

  it('deletes a leaf department after confirmation and refreshes tree', async () => {
    getDepartmentTreeMock.mockResolvedValue(departmentTreeResponse)
    deleteDepartmentMock.mockResolvedValue(undefined)
    const { wrapper } = await mountDepartmentsPage(['system:department:delete'])
    await flushPromises()

    const leafDepartment = departmentTreeResponse[0]!.children[0]!
    const deleteButtons = wrapper.findAll('[data-test="departments-delete"]')
    await deleteButtons[1]!.trigger('click')
    await flushPromises()
    const confirmButton = document.body.querySelector(
      '[data-test="departments-delete-confirm"]',
    ) as HTMLButtonElement | null
    expect(confirmButton).not.toBeNull()
    confirmButton!.click()
    await flushPromises()

    expect(deleteDepartmentMock).toHaveBeenCalledWith(leafDepartment.id)
    expect(getDepartmentTreeMock).toHaveBeenCalledTimes(2)
    expect(document.body.textContent).toContain('删除组织部门成功')
  })

  it('keeps delete dialog open when deleting department fails', async () => {
    getDepartmentTreeMock.mockResolvedValue(departmentTreeResponse)
    deleteDepartmentMock.mockRejectedValue(
      new SystemRequestError(409, '部门存在关联用户，不能删除'),
    )
    const { wrapper } = await mountDepartmentsPage(['system:department:delete'])
    await flushPromises()

    const deleteButtons = wrapper.findAll('[data-test="departments-delete"]')
    await deleteButtons[1]!.trigger('click')
    await flushPromises()
    const confirmButton = document.body.querySelector(
      '[data-test="departments-delete-confirm"]',
    ) as HTMLButtonElement | null
    expect(confirmButton).not.toBeNull()
    confirmButton!.click()
    await flushPromises()

    expect(deleteDepartmentMock).toHaveBeenCalledTimes(1)
    expect(getDepartmentTreeMock).toHaveBeenCalledTimes(1)
    expect(document.body.textContent).toContain('部门存在关联用户，不能删除')
    expect(document.body.querySelector('[data-test="departments-delete-confirm"]')).not.toBeNull()
  })

  it('filters by child keyword and preserves parent context', async () => {
    getDepartmentTreeMock.mockResolvedValue(departmentTreeResponse)
    const { wrapper } = await mountDepartmentsPage()
    await flushPromises()

    await wrapper.find('[data-test="departments-keyword"] input').setValue('  arch ')
    await wrapper.get('[data-test="departments-search"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('共 2 个')
    expect(wrapper.text()).toContain('研发中心')
    const filteredTree = wrapper.getComponent(NDataTable).props('data') as DepartmentTreeNode[]
    expect(filteredTree).toHaveLength(1)
    expect(filteredTree[0]!.children.map((child) => child.name)).toEqual(['平台架构组'])
  })

  it('does not apply draft keyword until search and reset restores full tree', async () => {
    getDepartmentTreeMock.mockResolvedValue(departmentTreeResponse)
    const { wrapper } = await mountDepartmentsPage()
    await flushPromises()

    expect(wrapper.text()).toContain('共 3 个')
    let tableData = wrapper.getComponent(NDataTable).props('data') as DepartmentTreeNode[]
    expect(tableData[0]!.children).toHaveLength(2)

    await wrapper.find('[data-test="departments-keyword"] input').setValue('arch')
    await flushPromises()

    expect(wrapper.text()).toContain('共 3 个')
    tableData = wrapper.getComponent(NDataTable).props('data') as DepartmentTreeNode[]
    expect(tableData[0]!.children).toHaveLength(2)

    await wrapper.get('[data-test="departments-search"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('共 2 个')
    tableData = wrapper.getComponent(NDataTable).props('data') as DepartmentTreeNode[]
    expect(tableData[0]!.children.map((child) => child.name)).toEqual(['平台架构组'])

    const resetButton = wrapper
      .findAll('button')
      .find((buttonWrapper) => buttonWrapper.text() === '重置')

    expect(resetButton).toBeDefined()
    await resetButton!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('共 3 个')
    tableData = wrapper.getComponent(NDataTable).props('data') as DepartmentTreeNode[]
    expect(tableData[0]!.children.map((child) => child.name)).toEqual(['平台架构组', '前端组'])
  })

  it('filters by status and preserves disabled child with parent context', async () => {
    getDepartmentTreeMock.mockResolvedValue(departmentTreeResponse)
    const { wrapper } = await mountDepartmentsPage()
    await flushPromises()

    wrapper.getComponent(NSelect).vm.$emit('update:value', DEPARTMENT_STATUS_DISABLED)
    await flushPromises()
    await wrapper.get('[data-test="departments-search"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('共 2 个')
    expect(wrapper.text()).toContain('研发中心')
    const statusFilteredTree = wrapper
      .getComponent(NDataTable)
      .props('data') as DepartmentTreeNode[]
    expect(statusFilteredTree[0]!.children.map((child) => child.name)).toEqual(['平台架构组'])
  })
})
