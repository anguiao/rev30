// @vitest-environment happy-dom

import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NDataTable, NPagination, NSelect } from 'naive-ui'
import {
  RESOURCE_OPEN_TARGET_SELF,
  RESOURCE_STATUS_DISABLED,
  RESOURCE_STATUS_ENABLED,
  RESOURCE_TYPE_ACTION,
  RESOURCE_TYPE_DIRECTORY,
  RESOURCE_TYPE_MENU,
  type ResourceTreeNode,
} from '@rev30/shared'
import { formatDateTime, getResourceTree } from '../../../src/features/system'
import ResourcesPage from '../../../src/pages/index/system/resources.vue'
import { disposeActiveTestPinia, mountAuthRoute, session, stubPreferredDark } from '../../helpers/auth'

enableAutoUnmount(afterEach)

vi.mock('../../../src/features/system', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/system')>()),
  getResourceTree: vi.fn(),
  getSystemErrorMessage: vi.fn((error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
  ),
}))

const getResourceTreeMock = vi.mocked(getResourceTree)

const resourceTreeResponse: ResourceTreeNode[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    parentId: null,
    type: RESOURCE_TYPE_DIRECTORY,
    name: 'System',
    code: 'system',
    path: null,
    externalUrl: null,
    openTarget: RESOURCE_OPEN_TARGET_SELF,
    icon: null,
    hidden: false,
    status: RESOURCE_STATUS_ENABLED,
    sortOrder: 1,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    children: [
      {
        id: '22222222-2222-4222-8222-222222222222',
        parentId: '11111111-1111-4111-8111-111111111111',
        type: RESOURCE_TYPE_MENU,
        name: 'Resource List',
        code: 'resource:list',
        path: '/system/resources',
        externalUrl: null,
        openTarget: RESOURCE_OPEN_TARGET_SELF,
        icon: null,
        hidden: false,
        status: RESOURCE_STATUS_ENABLED,
        sortOrder: 2,
        createdAt: '2026-05-02T00:00:00.000Z',
        updatedAt: '2026-05-02T00:00:00.000Z',
        children: [],
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        parentId: '11111111-1111-4111-8111-111111111111',
        type: RESOURCE_TYPE_ACTION,
        name: 'Resource Delete',
        code: 'resource:delete',
        path: null,
        externalUrl: null,
        openTarget: RESOURCE_OPEN_TARGET_SELF,
        icon: null,
        hidden: true,
        status: RESOURCE_STATUS_DISABLED,
        sortOrder: 3,
        createdAt: '2026-05-03T00:00:00.000Z',
        updatedAt: '2026-05-03T00:00:00.000Z',
        children: [],
      },
    ],
  },
]

async function mountResourcesPage(accessCodes: string[] = session.accessCodes) {
  return mountAuthRoute(
    '/system/resources',
    [{ path: '/system/resources', component: ResourcesPage }],
    {
      ...session,
      accessCodes,
    },
  )
}

describe('resources page', () => {
  beforeEach(() => {
    getResourceTreeMock.mockReset()
    localStorage.clear()
    document.documentElement.className = ''
    document.documentElement.style.colorScheme = ''
    stubPreferredDark(false)
  })

  afterEach(() => {
    disposeActiveTestPinia()
    vi.unstubAllGlobals()
  })

  it('loads and renders a resource tree without pagination', async () => {
    getResourceTreeMock.mockResolvedValue(resourceTreeResponse)
    const { wrapper } = await mountResourcesPage()
    await flushPromises()

    expect(getResourceTreeMock).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('资源管理')
    expect(wrapper.text()).toContain('共 3 个资源')
    expect(wrapper.text()).toContain('System')
    expect(wrapper.text()).toContain('resource:list')
    expect(wrapper.text()).toContain('resource:delete')
    expect(wrapper.text()).toContain('目录')
    expect(wrapper.text()).toContain('菜单')
    expect(wrapper.text()).toContain('操作')
    expect(wrapper.text()).toContain('否')
    expect(wrapper.text()).toContain('是')
    expect(wrapper.text()).toContain(formatDateTime('2026-05-01T00:00:00.000Z'))
    const table = wrapper.getComponent(NDataTable)
    expect(table.props('pagination')).toBe(false)
    expect(table.props('expandedRowKeys')).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
    ])
    table.vm.$emit('update:expandedRowKeys', ['11111111-1111-4111-8111-111111111111'])
    await flushPromises()
    expect(wrapper.getComponent(NDataTable).props('expandedRowKeys')).toEqual([
      '11111111-1111-4111-8111-111111111111',
    ])
    expect(wrapper.findComponent(NPagination).exists()).toBe(false)
  })

  it('shows the refresh button only when the user has list permission', async () => {
    getResourceTreeMock.mockResolvedValue(resourceTreeResponse)
    const { wrapper: unauthorizedWrapper } = await mountResourcesPage([])
    await flushPromises()

    expect(unauthorizedWrapper.find('[data-test="resources-refresh"]').exists()).toBe(false)

    const { wrapper: authorizedWrapper } = await mountResourcesPage(['system:resource:list'])
    await flushPromises()

    expect(authorizedWrapper.find('[data-test="resources-refresh"]').exists()).toBe(true)
  })

  it('filters by action type while preserving parent context', async () => {
    getResourceTreeMock.mockResolvedValue(resourceTreeResponse)
    const { wrapper } = await mountResourcesPage()
    await flushPromises()

    const typeSelect = wrapper
      .findAllComponents(NSelect)
      .find((componentWrapper) => componentWrapper.attributes('data-test') === 'resources-type')

    expect(typeSelect).toBeDefined()
    typeSelect!.vm.$emit('update:value', RESOURCE_TYPE_ACTION)
    await flushPromises()
    await wrapper.get('[data-test="resources-search"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('共 2 个资源')
    const filteredTree = wrapper.getComponent(NDataTable).props('data') as ResourceTreeNode[]
    expect(filteredTree).toHaveLength(1)
    expect(filteredTree[0]!.name).toBe('System')
    expect(filteredTree[0]!.children.map((child) => child.type)).toEqual([RESOURCE_TYPE_ACTION])
  })

  it('does not apply draft keyword until search and reset restores full tree', async () => {
    getResourceTreeMock.mockResolvedValue(resourceTreeResponse)
    const { wrapper } = await mountResourcesPage()
    await flushPromises()

    expect(wrapper.text()).toContain('共 3 个资源')
    let tableData = wrapper.getComponent(NDataTable).props('data') as ResourceTreeNode[]
    expect(tableData[0]!.children).toHaveLength(2)

    await wrapper.find('[data-test="resources-keyword"] input').setValue('delete')
    await flushPromises()

    expect(wrapper.text()).toContain('共 3 个资源')
    tableData = wrapper.getComponent(NDataTable).props('data') as ResourceTreeNode[]
    expect(tableData[0]!.children).toHaveLength(2)

    await wrapper.get('[data-test="resources-search"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('共 2 个资源')
    tableData = wrapper.getComponent(NDataTable).props('data') as ResourceTreeNode[]
    expect(tableData[0]!.children.map((child) => child.name)).toEqual(['Resource Delete'])

    const resetButton = wrapper
      .findAll('button')
      .find((buttonWrapper) => buttonWrapper.text() === '重置')

    expect(resetButton).toBeDefined()
    await resetButton!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('共 3 个资源')
    tableData = wrapper.getComponent(NDataTable).props('data') as ResourceTreeNode[]
    expect(tableData[0]!.children.map((child) => child.name)).toEqual([
      'Resource List',
      'Resource Delete',
    ])
  })
})
