// @vitest-environment happy-dom

import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NDataTable, NPagination, NSelect } from 'naive-ui'
import {
  DEPARTMENT_STATUS_DISABLED,
  DEPARTMENT_STATUS_ENABLED,
  type DepartmentTreeNode,
} from '@rev30/shared'
import { formatDateTime } from '../../../src/features/system/labels'
import { getDepartmentTree } from '../../../src/features/system/requests'
import DepartmentsPage from '../../../src/pages/index/system/departments.vue'
import { disposeActiveTestPinia, mountAuthRoute, stubPreferredDark } from '../../helpers/auth'

enableAutoUnmount(afterEach)

vi.mock('../../../src/features/system/requests', () => ({
  getDepartmentTree: vi.fn(),
  getSystemErrorMessage: vi.fn((error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
  ),
}))

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

async function mountDepartmentsPage() {
  return mountAuthRoute('/system/departments', [
    { path: '/system/departments', component: DepartmentsPage },
  ])
}

describe('departments page', () => {
  beforeEach(() => {
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
    expect(wrapper.text()).toContain('部门管理')
    expect(wrapper.text()).toContain('共 2 个部门')
    expect(wrapper.text()).toContain('研发中心')
    expect(wrapper.text()).toContain('ENG')
    expect(wrapper.text()).toContain(formatDateTime('2026-05-01T00:00:00.000Z'))
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
    expect(formatDateTime(treeData[0]!.children[0]!.createdAt)).toBe(
      formatDateTime('2026-05-02T00:00:00.000Z'),
    )
    expect(wrapper.findComponent(NPagination).exists()).toBe(false)
  })

  it('filters by child keyword and preserves parent context', async () => {
    getDepartmentTreeMock.mockResolvedValue(departmentTreeResponse)
    const { wrapper } = await mountDepartmentsPage()
    await flushPromises()

    await wrapper.find('[data-test="departments-keyword"] input').setValue('  arch ')
    await wrapper.get('[data-test="departments-search"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('共 2 个部门')
    expect(wrapper.text()).toContain('研发中心')
    const filteredTree = wrapper.getComponent(NDataTable).props('data') as DepartmentTreeNode[]
    expect(filteredTree).toHaveLength(1)
    expect(filteredTree[0]!.children.map((child) => child.name)).toEqual(['平台架构组'])
  })

  it('does not apply draft keyword until search and reset restores full tree', async () => {
    getDepartmentTreeMock.mockResolvedValue(departmentTreeResponse)
    const { wrapper } = await mountDepartmentsPage()
    await flushPromises()

    expect(wrapper.text()).toContain('共 3 个部门')
    let tableData = wrapper.getComponent(NDataTable).props('data') as DepartmentTreeNode[]
    expect(tableData[0]!.children).toHaveLength(2)

    await wrapper.find('[data-test="departments-keyword"] input').setValue('arch')
    await flushPromises()

    expect(wrapper.text()).toContain('共 3 个部门')
    tableData = wrapper.getComponent(NDataTable).props('data') as DepartmentTreeNode[]
    expect(tableData[0]!.children).toHaveLength(2)

    await wrapper.get('[data-test="departments-search"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('共 2 个部门')
    tableData = wrapper.getComponent(NDataTable).props('data') as DepartmentTreeNode[]
    expect(tableData[0]!.children.map((child) => child.name)).toEqual(['平台架构组'])

    const resetButton = wrapper
      .findAll('button')
      .find((buttonWrapper) => buttonWrapper.text() === '重置')

    expect(resetButton).toBeDefined()
    await resetButton!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('共 3 个部门')
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

    expect(wrapper.text()).toContain('共 2 个部门')
    expect(wrapper.text()).toContain('研发中心')
    const statusFilteredTree = wrapper
      .getComponent(NDataTable)
      .props('data') as DepartmentTreeNode[]
    expect(statusFilteredTree[0]!.children.map((child) => child.name)).toEqual(['平台架构组'])
  })
})
