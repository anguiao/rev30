import { PiniaColada } from '@pinia/colada'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError } from '../../../src/utils/request'
import { NInputNumber, NSelect } from 'naive-ui'
import {
  RESOURCE_OPEN_TARGET_BLANK,
  RESOURCE_OPEN_TARGET_SELF,
  RESOURCE_STATUS_DISABLED,
  RESOURCE_STATUS_ENABLED,
  RESOURCE_TYPE_ACTION,
  RESOURCE_TYPE_DIRECTORY,
  RESOURCE_TYPE_EXTERNAL,
  RESOURCE_TYPE_MENU,
  type Resource,
  type ResourceTreeNode,
} from '@rev30/contracts'
import {
  createResource,
  getResource,
  getResourceTreeOptions,
  updateResource,
} from '../../../src/features/system'
import ResourceFormDrawer from '../../../src/features/system/ResourceFormDrawer.vue'
vi.mock('../../../src/features/system/ResourceIconPicker.vue', () => ({
  default: defineComponent({
    name: 'ResourceIconPickerStub',
    props: {
      value: {
        type: String,
        default: null,
      },
    },
    emits: ['update:value', 'blur'],
    setup(props, { emit }) {
      return () =>
        h('div', { 'data-test': 'resource-icon-picker' }, [
          props.value
            ? h('span', { 'data-test': 'resource-icon-preview' }, props.value)
            : h('span', { 'data-test': 'resource-icon-empty' }, '无'),
          h('button', {
            'data-test': 'resource-icon-pick-users',
            type: 'button',
            onClick: () => emit('update:value', 'lucide:users'),
          }),
          h('button', {
            'data-test': 'resource-icon-pick-help',
            type: 'button',
            onClick: () => emit('update:value', 'lucide:circle-help'),
          }),
          h('button', {
            'data-test': 'resource-icon-clear',
            type: 'button',
            onClick: () => emit('update:value', null),
          }),
        ])
    },
  }),
}))

vi.mock('../../../src/features/system', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/system')>()),
  createResource: vi.fn(),
  getResource: vi.fn(),
  getResourceTreeOptions: vi.fn(),
  updateResource: vi.fn(),
}))

const createResourceMock = vi.mocked(createResource)
const getResourceMock = vi.mocked(getResource)
const getResourceTreeOptionsMock = vi.mocked(getResourceTreeOptions)
const updateResourceMock = vi.mocked(updateResource)

const rootResourceId = '11111111-1111-4111-8111-111111111111'
const menuResourceId = '22222222-2222-4222-8222-222222222222'
const actionResourceId = '33333333-3333-4333-8333-333333333333'
const externalResourceId = '44444444-4444-4444-8444-444444444444'
const secondRootResourceId = '55555555-5555-4555-8555-555555555555'

const resourceTreeResponse: ResourceTreeNode[] = [
  {
    id: rootResourceId,
    parentId: null,
    type: RESOURCE_TYPE_DIRECTORY,
    name: '系统管理',
    code: 'system',
    path: null,
    externalUrl: null,
    openTarget: RESOURCE_OPEN_TARGET_SELF,
    icon: 'lucide:settings',
    hidden: false,
    status: RESOURCE_STATUS_ENABLED,
    sortOrder: 1,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    children: [
      {
        id: menuResourceId,
        parentId: rootResourceId,
        type: RESOURCE_TYPE_MENU,
        name: '系统用户',
        code: 'system:user',
        path: '/system/users',
        externalUrl: null,
        openTarget: RESOURCE_OPEN_TARGET_SELF,
        icon: 'lucide:users',
        hidden: false,
        status: RESOURCE_STATUS_ENABLED,
        sortOrder: 2,
        createdAt: '2026-05-02T00:00:00.000Z',
        updatedAt: '2026-05-02T00:00:00.000Z',
        children: [
          {
            id: actionResourceId,
            parentId: menuResourceId,
            type: RESOURCE_TYPE_ACTION,
            name: '创建用户',
            code: 'system:user:create',
            path: null,
            externalUrl: null,
            openTarget: RESOURCE_OPEN_TARGET_SELF,
            icon: null,
            hidden: true,
            status: RESOURCE_STATUS_ENABLED,
            sortOrder: 3,
            createdAt: '2026-05-03T00:00:00.000Z',
            updatedAt: '2026-05-03T00:00:00.000Z',
            children: [],
          },
        ],
      },
      {
        id: externalResourceId,
        parentId: rootResourceId,
        type: RESOURCE_TYPE_EXTERNAL,
        name: '项目文档',
        code: 'docs',
        path: null,
        externalUrl: 'https://example.com/docs',
        openTarget: RESOURCE_OPEN_TARGET_BLANK,
        icon: 'lucide:book-open',
        hidden: false,
        status: RESOURCE_STATUS_DISABLED,
        sortOrder: 4,
        createdAt: '2026-05-04T00:00:00.000Z',
        updatedAt: '2026-05-04T00:00:00.000Z',
        children: [],
      },
    ],
  },
  {
    id: secondRootResourceId,
    parentId: null,
    type: RESOURCE_TYPE_DIRECTORY,
    name: '内容管理',
    code: 'content',
    path: null,
    externalUrl: null,
    openTarget: RESOURCE_OPEN_TARGET_SELF,
    icon: null,
    hidden: false,
    status: RESOURCE_STATUS_ENABLED,
    sortOrder: 5,
    createdAt: '2026-05-05T00:00:00.000Z',
    updatedAt: '2026-05-05T00:00:00.000Z',
    children: [],
  },
]

const menuResourceResponse: Resource = {
  id: menuResourceId,
  parentId: rootResourceId,
  type: RESOURCE_TYPE_MENU,
  name: '系统用户',
  code: 'system:user',
  path: '/system/users',
  externalUrl: null,
  openTarget: RESOURCE_OPEN_TARGET_SELF,
  icon: 'lucide:users',
  hidden: false,
  status: RESOURCE_STATUS_ENABLED,
  sortOrder: 2,
  createdAt: '2026-05-02T00:00:00.000Z',
  updatedAt: '2026-05-02T00:00:00.000Z',
}
const updatedMenuResourceResponse: Resource = {
  ...menuResourceResponse,
  name: '成员管理',
  icon: 'lucide:circle-help',
  updatedAt: '2026-05-20T00:00:00.000Z',
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  return {
    promise,
    resolve,
    reject,
  }
}

function mountDrawer(
  props: {
    show?: boolean
    resourceId?: string | null
    parentId?: string | null
  } = {},
) {
  const pinia = createPinia()
  setActivePinia(pinia)

  return mount(ResourceFormDrawer, {
    props: {
      show: props.show ?? true,
      resourceId: props.resourceId === undefined ? null : props.resourceId,
      parentId: props.parentId === undefined ? null : props.parentId,
    },
    attachTo: document.body,
    global: {
      plugins: [pinia, PiniaColada],
      stubs: {
        teleport: true,
      },
    },
  })
}

async function submitForm(wrapper: ReturnType<typeof mount>) {
  await wrapper.get('[data-test="resource-form-submit"]').trigger('click')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

function getSelect(wrapper: ReturnType<typeof mount>, testId: string) {
  const select = wrapper
    .findAllComponents(NSelect)
    .find((componentWrapper) => componentWrapper.attributes('data-test') === testId)

  expect(select).toBeDefined()

  return select!
}

describe('ResourceFormDrawer', () => {
  beforeEach(() => {
    createResourceMock.mockReset()
    getResourceMock.mockReset()
    getResourceTreeOptionsMock.mockReset()
    updateResourceMock.mockReset()

    getResourceTreeOptionsMock.mockResolvedValue(resourceTreeResponse)
  })

  it('creates a root directory resource with default values', async () => {
    createResourceMock.mockResolvedValue({
      ...menuResourceResponse,
      id: '66666666-6666-4666-8666-666666666666',
      parentId: null,
      type: RESOURCE_TYPE_DIRECTORY,
      name: '审计管理',
      code: 'audit',
      path: null,
      icon: null,
      sortOrder: 0,
    })

    const wrapper = mountDrawer({
      show: true,
      resourceId: null,
      parentId: null,
    })
    await flushPromises()

    expect(getResourceTreeOptionsMock).toHaveBeenCalledWith()
    expect(getResourceMock).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('新增权限资源')
    expect(wrapper.get('[data-test="resource-icon-empty"]').text()).toBe('无')

    await wrapper.get('[data-test="resource-form-name"] input').setValue('审计管理')
    await wrapper.get('[data-test="resource-form-code"] input').setValue('audit')
    await submitForm(wrapper)

    expect(createResourceMock).toHaveBeenCalledWith({
      type: RESOURCE_TYPE_DIRECTORY,
      name: '审计管理',
      code: 'audit',
      parentId: null,
      path: null,
      externalUrl: null,
      openTarget: RESOURCE_OPEN_TARGET_SELF,
      icon: null,
      hidden: false,
      status: RESOURCE_STATUS_ENABLED,
      sortOrder: 0,
    })
    expect(wrapper.emitted('saved')).toHaveLength(1)
    expect(wrapper.emitted('update:show')).toEqual([[false]])
  })

  it('shows a load error and disables submit when resource options fail to load', async () => {
    getResourceTreeOptionsMock.mockRejectedValue(new Error('network'))

    const wrapper = mountDrawer({
      show: true,
      resourceId: null,
      parentId: null,
    })
    await flushPromises()

    expect(wrapper.text()).toContain('network')
    expect(wrapper.get('[data-test="resource-form-submit"]').attributes('disabled')).toBeDefined()

    await wrapper.get('[data-test="resource-form-name"] input').setValue('异常资源')
    await wrapper.get('[data-test="resource-form-code"] input').setValue('blocked-resource')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(createResourceMock).not.toHaveBeenCalled()
    expect(updateResourceMock).not.toHaveBeenCalled()
  })

  it('creates a child menu resource with the provided parent id', async () => {
    createResourceMock.mockResolvedValue({
      ...menuResourceResponse,
      id: '77777777-7777-4777-8777-777777777777',
      parentId: rootResourceId,
      name: '权限资源',
      code: 'system:resource',
      path: '/system/resources',
    })

    const wrapper = mountDrawer({
      show: true,
      resourceId: null,
      parentId: rootResourceId,
    })
    await flushPromises()

    expect(getResourceTreeOptionsMock).toHaveBeenCalledWith([rootResourceId])

    getSelect(wrapper, 'resource-form-type').vm.$emit('update:value', RESOURCE_TYPE_MENU)
    await flushPromises()
    await wrapper.get('[data-test="resource-form-name"] input').setValue('权限资源')
    await wrapper.get('[data-test="resource-form-code"] input').setValue('system:resource')
    await wrapper.get('[data-test="resource-form-path"] input').setValue('/system/resources')
    await submitForm(wrapper)

    expect(createResourceMock).toHaveBeenCalledWith({
      type: RESOURCE_TYPE_MENU,
      name: '权限资源',
      code: 'system:resource',
      parentId: rootResourceId,
      path: '/system/resources',
      externalUrl: null,
      openTarget: RESOURCE_OPEN_TARGET_SELF,
      icon: null,
      hidden: false,
      status: RESOURCE_STATUS_ENABLED,
      sortOrder: 0,
    })
  })

  it('loads resource detail and renders icon preview', async () => {
    getResourceMock.mockResolvedValue(menuResourceResponse)
    updateResourceMock.mockResolvedValue({
      ...menuResourceResponse,
      name: '成员管理',
    })

    const wrapper = mountDrawer({
      show: true,
      resourceId: menuResourceId,
      parentId: null,
    })
    await flushPromises()

    expect(getResourceTreeOptionsMock).toHaveBeenCalledWith([rootResourceId, menuResourceId])
    expect(getResourceMock).toHaveBeenCalledWith(menuResourceId)
    expect(wrapper.text()).toContain('编辑权限资源')
    expect(wrapper.get('[data-test="resource-icon-preview"]').text()).toBe('lucide:users')

    await wrapper.get('[data-test="resource-form-name"] input').setValue('成员管理')
    await submitForm(wrapper)

    expect(updateResourceMock).toHaveBeenCalledWith(menuResourceId, {
      type: RESOURCE_TYPE_MENU,
      name: '成员管理',
      code: 'system:user',
      parentId: rootResourceId,
      path: '/system/users',
      externalUrl: null,
      openTarget: RESOURCE_OPEN_TARGET_SELF,
      icon: 'lucide:users',
      hidden: false,
      status: RESOURCE_STATUS_ENABLED,
      sortOrder: 2,
    })
  })

  it('reloads detail when reopening the same resource after save', async () => {
    getResourceMock
      .mockResolvedValueOnce(menuResourceResponse)
      .mockResolvedValueOnce(updatedMenuResourceResponse)
    updateResourceMock.mockResolvedValue(updatedMenuResourceResponse)

    const wrapper = mountDrawer({
      show: true,
      resourceId: menuResourceId,
      parentId: null,
    })
    await flushPromises()

    await wrapper.get('[data-test="resource-form-name"] input').setValue('成员管理')
    await wrapper.get('[data-test="resource-icon-pick-help"]').trigger('click')
    await submitForm(wrapper)

    expect(wrapper.emitted('saved')).toHaveLength(1)
    expect(wrapper.emitted('update:show')).toEqual([[false]])

    await wrapper.setProps({
      show: false,
      resourceId: menuResourceId,
      parentId: null,
    })
    await flushPromises()
    await wrapper.setProps({
      show: true,
      resourceId: menuResourceId,
      parentId: null,
    })
    await flushPromises()

    expect(getResourceMock).toHaveBeenCalledTimes(2)
    expect(
      (wrapper.get('[data-test="resource-form-name"] input').element as HTMLInputElement).value,
    ).toBe(updatedMenuResourceResponse.name)
    expect(wrapper.get('[data-test="resource-icon-preview"]').text()).toBe(
      updatedMenuResourceResponse.icon,
    )
  })

  it('submits external resources with external url and blank target', async () => {
    createResourceMock.mockResolvedValue({
      ...menuResourceResponse,
      id: '88888888-8888-4888-8888-888888888888',
      type: RESOURCE_TYPE_EXTERNAL,
      name: '帮助中心',
      code: 'help',
      path: null,
      externalUrl: 'https://example.com/help',
      openTarget: RESOURCE_OPEN_TARGET_BLANK,
      icon: 'lucide:circle-help',
    })

    const wrapper = mountDrawer()
    await flushPromises()

    getSelect(wrapper, 'resource-form-type').vm.$emit('update:value', RESOURCE_TYPE_EXTERNAL)
    await flushPromises()
    await wrapper.get('[data-test="resource-form-name"] input').setValue('帮助中心')
    await wrapper.get('[data-test="resource-form-code"] input').setValue('help')
    await wrapper
      .get('[data-test="resource-form-external-url"] input')
      .setValue('https://example.com/help')
    await wrapper.get('[data-test="resource-icon-pick-help"]').trigger('click')
    wrapper.getComponent(NInputNumber).vm.$emit('update:value', 6)
    await flushPromises()

    expect(wrapper.get('[data-test="resource-icon-preview"]').text()).toBe('lucide:circle-help')

    await submitForm(wrapper)

    expect(createResourceMock).toHaveBeenCalledWith({
      type: RESOURCE_TYPE_EXTERNAL,
      name: '帮助中心',
      code: 'help',
      parentId: null,
      path: null,
      externalUrl: 'https://example.com/help',
      openTarget: RESOURCE_OPEN_TARGET_BLANK,
      icon: 'lucide:circle-help',
      hidden: false,
      status: RESOURCE_STATUS_ENABLED,
      sortOrder: 6,
    })
  })

  it('binds selected and cleared icon values from the icon picker', async () => {
    createResourceMock.mockResolvedValue({
      ...menuResourceResponse,
      id: '99999999-9999-4999-8999-999999999999',
      parentId: null,
      type: RESOURCE_TYPE_DIRECTORY,
      name: '图标管理',
      code: 'icons',
      icon: null,
      sortOrder: 0,
    })

    const wrapper = mountDrawer()
    await flushPromises()

    await wrapper.get('[data-test="resource-form-name"] input').setValue('图标管理')
    await wrapper.get('[data-test="resource-form-code"] input').setValue('icons')
    await wrapper.get('[data-test="resource-icon-pick-users"]').trigger('click')
    await wrapper.get('[data-test="resource-icon-clear"]').trigger('click')
    await submitForm(wrapper)

    expect(createResourceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        icon: null,
      }),
    )
  })

  it('shows a field-level server error when create fails', async () => {
    createResourceMock.mockRejectedValue(new ApiRequestError(409, '权限编码已存在', 'code'))

    const wrapper = mountDrawer()
    await flushPromises()

    await wrapper.get('[data-test="resource-form-name"] input').setValue('审计管理')
    await wrapper.get('[data-test="resource-form-code"] input').setValue('audit')
    await submitForm(wrapper)

    expect(createResourceMock).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('权限编码已存在')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('ignores stale mutation errors from a previous create session', async () => {
    const pendingCreate = deferred<Resource>()
    createResourceMock.mockImplementationOnce(() => pendingCreate.promise)

    const wrapper = mountDrawer({
      show: true,
      resourceId: null,
      parentId: rootResourceId,
    })
    await flushPromises()

    await wrapper.get('[data-test="resource-form-name"] input').setValue('旧会话')
    await wrapper.get('[data-test="resource-form-code"] input').setValue('stale-resource')
    await submitForm(wrapper)

    expect(createResourceMock).toHaveBeenCalledTimes(1)

    await wrapper.setProps({
      show: false,
      resourceId: null,
      parentId: rootResourceId,
    })
    await flushPromises()
    await wrapper.setProps({
      show: true,
      resourceId: null,
      parentId: rootResourceId,
    })
    await flushPromises()

    await wrapper.get('[data-test="resource-form-name"] input').setValue('新会话')
    await wrapper.get('[data-test="resource-form-code"] input').setValue('fresh-resource')

    pendingCreate.reject(new ApiRequestError(400, '旧会话错误', 'code'))
    await flushPromises()

    const codeFieldContainer = wrapper
      .get('[data-test="resource-form-code"]')
      .element.closest('.n-form-item')

    expect(codeFieldContainer?.textContent).not.toContain('旧会话错误')
    expect(wrapper.text()).not.toContain('旧会话错误')
    expect(wrapper.emitted('saved')).toBeUndefined()
    expect(wrapper.emitted('update:show')).toBeUndefined()
  })
})
