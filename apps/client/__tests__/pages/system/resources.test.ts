import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError } from '../../../src/utils/request'
import { defineComponent, h } from 'vue'
import { NDataTable, NPagination, NSelect } from 'naive-ui'
import {
  RESOURCE_OPEN_TARGET_SELF,
  RESOURCE_STATUS_DISABLED,
  RESOURCE_STATUS_ENABLED,
  RESOURCE_TYPE_ACTION,
  RESOURCE_TYPE_DIRECTORY,
  RESOURCE_TYPE_MENU,
  type ResourceTreeNode,
} from '@rev30/contracts'
import { formatDisplayDateTime } from '@rev30/utils'
import { deleteResource, getResourceTree } from '../../../src/features/system'
import ResourcesPage from '../../../src/pages/index/system/resources.vue'
import {
  disposeActiveTestPinia,
  mountAuthRoute,
  session,
  stubPreferredDark,
} from '../../helpers/auth'
vi.mock('../../../src/features/system/ResourceFormDrawer.vue', () => ({
  default: defineComponent({
    name: 'ResourceFormDrawerStub',
    props: {
      show: { type: Boolean, required: true },
      resourceId: { type: String, default: null },
      parentId: { type: String, default: null },
    },
    emits: ['update:show', 'saved'],
    setup(props) {
      return () =>
        h('div', {
          'data-parent-id': props.parentId ?? '',
          'data-resource-id': props.resourceId ?? '',
          'data-show': String(props.show),
          'data-test': 'resource-form-drawer',
        })
    },
  }),
}))

vi.mock('../../../src/features/system', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/system')>()),
  deleteResource: vi.fn(),
  getResourceTree: vi.fn(),
}))

const deleteResourceMock = vi.mocked(deleteResource)
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
    deleteResourceMock.mockReset()
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
    expect(wrapper.text()).toContain('权限资源')
    expect(wrapper.text()).toContain('共 3 个')
    expect(wrapper.text()).toContain('System')
    expect(wrapper.text()).toContain('resource:list')
    expect(wrapper.text()).toContain('resource:delete')
    expect(wrapper.text()).toContain('目录')
    expect(wrapper.text()).toContain('菜单')
    expect(wrapper.text()).toContain('操作')
    expect(wrapper.text()).toContain('否')
    expect(wrapper.text()).toContain('是')
    expect(wrapper.text()).toContain(formatDisplayDateTime('2026-05-01T00:00:00.000Z'))
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

  it('shows a server load error when resources cannot be loaded', async () => {
    getResourceTreeMock.mockRejectedValue(new ApiRequestError(500, '加载资源树失败'))
    const { wrapper } = await mountResourcesPage()
    await flushPromises()

    expect(getResourceTreeMock).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('加载资源树失败')
  })

  it('shows a plain load error for unexpected resource load errors', async () => {
    getResourceTreeMock.mockRejectedValue(new Error('network down'))
    const { wrapper } = await mountResourcesPage()
    await flushPromises()

    expect(getResourceTreeMock).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('network down')
  })

  it('shows create and row actions according to permissions', async () => {
    getResourceTreeMock.mockResolvedValue(resourceTreeResponse)
    const { wrapper: unauthorizedWrapper } = await mountResourcesPage([])
    await flushPromises()

    expect(unauthorizedWrapper.find('[data-test="resources-create"]').exists()).toBe(false)
    expect(unauthorizedWrapper.find('[data-test="resources-create-child"]').exists()).toBe(false)
    expect(unauthorizedWrapper.find('[data-test="resources-edit"]').exists()).toBe(false)
    expect(unauthorizedWrapper.find('[data-test="resources-delete"]').exists()).toBe(false)

    const { wrapper: authorizedWrapper } = await mountResourcesPage([
      'system:resource:create',
      'system:resource:update',
      'system:resource:list',
      'system:resource:delete',
    ])
    await flushPromises()

    expect(authorizedWrapper.find('[data-test="resources-create"]').exists()).toBe(true)
    expect(authorizedWrapper.find('[data-test="resources-create-child"]').exists()).toBe(true)
    expect(authorizedWrapper.find('[data-test="resources-edit"]').exists()).toBe(true)
    expect(authorizedWrapper.find('[data-test="resources-delete"]').exists()).toBe(true)
  })

  it('opens create, child create, and edit drawers', async () => {
    getResourceTreeMock.mockResolvedValue(resourceTreeResponse)
    const { wrapper } = await mountResourcesPage([
      'system:resource:create',
      'system:resource:update',
      'system:resource:list',
    ])
    await flushPromises()

    const drawer = wrapper.get('[data-test="resource-form-drawer"]')
    expect(drawer.attributes('data-show')).toBe('false')
    expect(drawer.attributes('data-resource-id')).toBe('')
    expect(drawer.attributes('data-parent-id')).toBe('')

    await wrapper.get('[data-test="resources-create"]').trigger('click')
    await flushPromises()

    expect(drawer.attributes('data-show')).toBe('true')
    expect(drawer.attributes('data-resource-id')).toBe('')
    expect(drawer.attributes('data-parent-id')).toBe('')

    await wrapper.get('[data-test="resources-create-child"]').trigger('click')
    await flushPromises()

    expect(drawer.attributes('data-show')).toBe('true')
    expect(drawer.attributes('data-resource-id')).toBe('')
    expect(drawer.attributes('data-parent-id')).toBe(resourceTreeResponse[0]!.id)

    await wrapper.get('[data-test="resources-edit"]').trigger('click')
    await flushPromises()

    expect(drawer.attributes('data-show')).toBe('true')
    expect(drawer.attributes('data-resource-id')).toBe(resourceTreeResponse[0]!.id)
    expect(drawer.attributes('data-parent-id')).toBe('')
  })

  it('shows a success message and refreshes after drawer saves', async () => {
    getResourceTreeMock.mockResolvedValue(resourceTreeResponse)
    const { wrapper } = await mountResourcesPage(['system:resource:create', 'system:resource:list'])
    await flushPromises()

    await wrapper.get('[data-test="resources-create"]').trigger('click')
    await flushPromises()
    await wrapper.getComponent({ name: 'ResourceFormDrawerStub' }).vm.$emit('saved')
    await flushPromises()

    expect(getResourceTreeMock).toHaveBeenCalledTimes(2)
    expect(document.body.textContent).toContain('保存权限资源成功')
  })

  it('disables row delete when a resource has children', async () => {
    getResourceTreeMock.mockResolvedValue(resourceTreeResponse)
    const { wrapper } = await mountResourcesPage(['system:resource:delete'])
    await flushPromises()

    const deleteButtons = wrapper.findAll('[data-test="resources-delete"]')
    expect(deleteButtons).toHaveLength(3)
    expect(deleteButtons[0]!.attributes('disabled')).toBeDefined()

    await deleteButtons[0]!.trigger('click')
    await flushPromises()

    expect(document.body.querySelector('[data-test="resources-delete-confirm"]')).toBeNull()
    expect(deleteResourceMock).not.toHaveBeenCalled()
  })

  it('keeps delete disabled for filtered resources with hidden children', async () => {
    getResourceTreeMock.mockResolvedValue(resourceTreeResponse)
    const { wrapper } = await mountResourcesPage(['system:resource:delete'])
    await flushPromises()

    const typeSelect = wrapper
      .findAllComponents(NSelect)
      .find((componentWrapper) => componentWrapper.attributes('data-test') === 'resources-type')

    expect(typeSelect).toBeDefined()
    typeSelect!.vm.$emit('update:value', RESOURCE_TYPE_DIRECTORY)
    await wrapper.get('[data-test="resources-search"]').trigger('click')
    await flushPromises()

    const tableData = wrapper.getComponent(NDataTable).props('data') as ResourceTreeNode[]
    expect(tableData).toHaveLength(1)
    expect(tableData[0]!.children).toEqual([])

    const deleteButtons = wrapper.findAll('[data-test="resources-delete"]')
    expect(deleteButtons).toHaveLength(1)
    expect(deleteButtons[0]!.attributes('disabled')).toBeDefined()

    await deleteButtons[0]!.trigger('click')
    await flushPromises()

    expect(document.body.querySelector('[data-test="resources-delete-confirm"]')).toBeNull()
    expect(deleteResourceMock).not.toHaveBeenCalled()
  })

  it('deletes a leaf resource after confirmation and refreshes tree', async () => {
    getResourceTreeMock.mockResolvedValue(resourceTreeResponse)
    deleteResourceMock.mockResolvedValue(undefined)
    const { wrapper } = await mountResourcesPage(['system:resource:delete'])
    await flushPromises()

    const leafResource = resourceTreeResponse[0]!.children[0]!
    const deleteButtons = wrapper.findAll('[data-test="resources-delete"]')
    await deleteButtons[1]!.trigger('click')
    await flushPromises()
    const confirmButton = document.body.querySelector(
      '[data-test="resources-delete-confirm"]',
    ) as HTMLButtonElement | null
    expect(confirmButton).not.toBeNull()
    confirmButton!.click()
    await flushPromises()

    expect(deleteResourceMock).toHaveBeenCalledWith(leafResource.id)
    expect(getResourceTreeMock).toHaveBeenCalledTimes(2)
    expect(document.body.textContent).toContain('删除权限资源成功')
  })

  it('keeps delete dialog open when deleting resource fails', async () => {
    getResourceTreeMock.mockResolvedValue(resourceTreeResponse)
    deleteResourceMock.mockRejectedValue(new ApiRequestError(409, '资源已被角色授权，不能删除'))
    const { wrapper } = await mountResourcesPage(['system:resource:delete'])
    await flushPromises()

    const deleteButtons = wrapper.findAll('[data-test="resources-delete"]')
    await deleteButtons[1]!.trigger('click')
    await flushPromises()
    const confirmButton = document.body.querySelector(
      '[data-test="resources-delete-confirm"]',
    ) as HTMLButtonElement | null
    expect(confirmButton).not.toBeNull()
    confirmButton!.click()
    await flushPromises()

    expect(deleteResourceMock).toHaveBeenCalledTimes(1)
    expect(getResourceTreeMock).toHaveBeenCalledTimes(1)
    expect(document.body.textContent).toContain('资源已被角色授权，不能删除')
    expect(document.body.querySelector('[data-test="resources-delete-confirm"]')).not.toBeNull()
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

    expect(wrapper.text()).toContain('共 2 个')
    const filteredTree = wrapper.getComponent(NDataTable).props('data') as ResourceTreeNode[]
    expect(filteredTree).toHaveLength(1)
    expect(filteredTree[0]!.name).toBe('System')
    expect(filteredTree[0]!.children.map((child) => child.type)).toEqual([RESOURCE_TYPE_ACTION])
  })

  it('does not apply draft keyword until search and reset restores full tree', async () => {
    getResourceTreeMock.mockResolvedValue(resourceTreeResponse)
    const { wrapper } = await mountResourcesPage()
    await flushPromises()

    expect(wrapper.text()).toContain('共 3 个')
    let tableData = wrapper.getComponent(NDataTable).props('data') as ResourceTreeNode[]
    expect(tableData[0]!.children).toHaveLength(2)

    await wrapper.find('[data-test="resources-keyword"] input').setValue('delete')
    await flushPromises()

    expect(wrapper.text()).toContain('共 3 个')
    tableData = wrapper.getComponent(NDataTable).props('data') as ResourceTreeNode[]
    expect(tableData[0]!.children).toHaveLength(2)

    await wrapper.get('[data-test="resources-search"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('共 2 个')
    tableData = wrapper.getComponent(NDataTable).props('data') as ResourceTreeNode[]
    expect(tableData[0]!.children.map((child) => child.name)).toEqual(['Resource Delete'])

    const resetButton = wrapper
      .findAll('button')
      .find((buttonWrapper) => buttonWrapper.text() === '重置')

    expect(resetButton).toBeDefined()
    await resetButton!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('共 3 个')
    tableData = wrapper.getComponent(NDataTable).props('data') as ResourceTreeNode[]
    expect(tableData[0]!.children.map((child) => child.name)).toEqual([
      'Resource List',
      'Resource Delete',
    ])
  })
})
