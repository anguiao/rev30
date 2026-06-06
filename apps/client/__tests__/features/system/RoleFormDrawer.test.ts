import { PiniaColada } from '@pinia/colada'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError } from '../../../src/utils/request'
import { NInputNumber, NSelect, NTree } from 'naive-ui'
import {
  RESOURCE_OPEN_TARGET_SELF,
  RESOURCE_STATUS_DISABLED,
  RESOURCE_STATUS_ENABLED,
  RESOURCE_TYPE_ACTION,
  RESOURCE_TYPE_DIRECTORY,
  ROLE_STATUS_ENABLED,
  type ResourceTreeNode,
  type Role,
} from '@rev30/contracts'
import {
  createRole,
  getRole,
  getResourceTreeOptions,
  updateRole,
} from '../../../src/features/system'
import RoleFormDrawer from '../../../src/features/system/RoleFormDrawer.vue'
import { createPinia, setActivePinia } from 'pinia'
vi.mock('../../../src/features/system', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/system')>()),
  createRole: vi.fn(),
  getResourceTreeOptions: vi.fn(),
  getRole: vi.fn(),
  updateRole: vi.fn(),
}))

const createRoleMock = vi.mocked(createRole)
const getResourceTreeOptionsMock = vi.mocked(getResourceTreeOptions)
const getRoleMock = vi.mocked(getRole)
const updateRoleMock = vi.mocked(updateRole)

const directoryResourceId = '11111111-1111-4111-8111-111111111111'
const actionResourceId = '22222222-2222-4222-8222-222222222222'
const secondActionResourceId = '44444444-4444-4444-8444-444444444444'
const roleId = '33333333-3333-4333-8333-333333333333'
const secondRoleId = '55555555-5555-4555-8555-555555555555'

const resourceTreeResponse: ResourceTreeNode[] = [
  {
    id: directoryResourceId,
    parentId: null,
    type: RESOURCE_TYPE_DIRECTORY,
    name: '系统管理',
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
        id: actionResourceId,
        parentId: directoryResourceId,
        type: RESOURCE_TYPE_ACTION,
        name: '角色保存',
        code: 'system:role:save',
        path: null,
        externalUrl: null,
        openTarget: RESOURCE_OPEN_TARGET_SELF,
        icon: null,
        hidden: false,
        status: RESOURCE_STATUS_DISABLED,
        sortOrder: 2,
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
        children: [],
      },
      {
        id: secondActionResourceId,
        parentId: directoryResourceId,
        type: RESOURCE_TYPE_ACTION,
        name: '角色分配',
        code: 'system:role:assign',
        path: null,
        externalUrl: null,
        openTarget: RESOURCE_OPEN_TARGET_SELF,
        icon: null,
        hidden: false,
        status: RESOURCE_STATUS_ENABLED,
        sortOrder: 3,
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
        children: [],
      },
    ],
  },
]

const roleResponse: Role = {
  id: roleId,
  name: '运营',
  code: 'operator',
  status: ROLE_STATUS_ENABLED,
  sortOrder: 2,
  resources: [
    {
      id: directoryResourceId,
      name: '系统管理',
      code: 'system',
      type: RESOURCE_TYPE_DIRECTORY,
    },
    {
      id: actionResourceId,
      name: '角色保存',
      code: 'system:role:save',
      type: RESOURCE_TYPE_ACTION,
    },
  ],
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
}
const updatedRoleResponse: Role = {
  ...roleResponse,
  name: '运营负责人',
  sortOrder: 3,
  updatedAt: '2026-05-20T00:00:00.000Z',
}

const secondRoleResponse: Role = {
  id: secondRoleId,
  name: '审计',
  code: 'auditor',
  status: ROLE_STATUS_ENABLED,
  sortOrder: 5,
  resources: [
    {
      id: directoryResourceId,
      name: '系统管理',
      code: 'system',
      type: RESOURCE_TYPE_DIRECTORY,
    },
    {
      id: secondActionResourceId,
      name: '角色分配',
      code: 'system:role:assign',
      type: RESOURCE_TYPE_ACTION,
    },
  ],
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
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

function mountDrawer(props = { show: true, roleId: null as string | null }) {
  const pinia = createPinia()
  setActivePinia(pinia)

  return mount(RoleFormDrawer, {
    props,
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
  await wrapper.get('[data-test="role-form-submit"]').trigger('click')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

describe('RoleFormDrawer', () => {
  beforeEach(() => {
    createRoleMock.mockReset()
    getResourceTreeOptionsMock.mockReset()
    getRoleMock.mockReset()
    updateRoleMock.mockReset()

    getResourceTreeOptionsMock.mockResolvedValue(resourceTreeResponse)
  })

  it('submits a new role in create mode', async () => {
    createRoleMock.mockResolvedValue(roleResponse)

    const wrapper = mountDrawer()
    await flushPromises()

    expect(wrapper.text()).toContain('新增系统角色')
    expect(getResourceTreeOptionsMock).toHaveBeenCalledWith()
    expect(wrapper.getComponent(NTree).props('data')).toEqual([
      {
        key: directoryResourceId,
        label: '系统管理 (system)',
        disabled: false,
        children: [
          {
            key: actionResourceId,
            label: '角色保存 (system:role:save)',
            disabled: true,
          },
          {
            key: secondActionResourceId,
            label: '角色分配 (system:role:assign)',
            disabled: false,
          },
        ],
      },
    ])
    expect(wrapper.get('[data-test="role-form-resources"]').attributes('data-test')).toBe(
      'role-form-resources',
    )

    await wrapper.get('[data-test="role-form-name"] input').setValue('运营')
    await wrapper.get('[data-test="role-form-code"] input').setValue('operator')
    wrapper.getComponent(NInputNumber).vm.$emit('update:value', 2)
    wrapper
      .get('[data-test="role-form-resources"]')
      .getComponent(NTree)
      .vm.$emit('update:checkedKeys', [directoryResourceId, actionResourceId])
    await flushPromises()

    await submitForm(wrapper)

    expect(createRoleMock).toHaveBeenCalledWith({
      name: '运营',
      code: 'operator',
      status: ROLE_STATUS_ENABLED,
      sortOrder: 2,
      resourceIds: [directoryResourceId, actionResourceId],
    })
    expect(wrapper.emitted('saved')).toHaveLength(1)
    expect(wrapper.emitted('update:show')).toEqual([[false]])
  })

  it('reloads detail when reopening the same role after save', async () => {
    getRoleMock.mockResolvedValueOnce(roleResponse).mockResolvedValueOnce(updatedRoleResponse)
    updateRoleMock.mockResolvedValue(updatedRoleResponse)

    const wrapper = mountDrawer({ show: true, roleId })
    await flushPromises()

    await wrapper.get('[data-test="role-form-name"] input').setValue('运营负责人')
    wrapper.getComponent(NInputNumber).vm.$emit('update:value', 3)
    await submitForm(wrapper)

    expect(wrapper.emitted('saved')).toHaveLength(1)
    expect(wrapper.emitted('update:show')).toEqual([[false]])

    await wrapper.setProps({ show: false, roleId })
    await flushPromises()
    await wrapper.setProps({ show: true, roleId })
    await flushPromises()

    expect(getRoleMock).toHaveBeenCalledTimes(2)
    expect(wrapper.get('[data-test="role-form-name"] input').element).toHaveProperty(
      'value',
      updatedRoleResponse.name,
    )
    expect(wrapper.getComponent(NInputNumber).props('value')).toBe(updatedRoleResponse.sortOrder)
  })

  it('shows a load error and disables submit when resource permissions fail to load', async () => {
    getResourceTreeOptionsMock.mockRejectedValue(new Error('network'))

    const wrapper = mountDrawer()
    await flushPromises()

    expect(wrapper.text()).toContain('network')
    expect(wrapper.get('[data-test="role-form-submit"]').attributes('disabled')).toBeDefined()

    await wrapper.get('[data-test="role-form-name"] input').setValue('异常角色')
    await wrapper.get('[data-test="role-form-code"] input').setValue('blocked-role')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(createRoleMock).not.toHaveBeenCalled()
    expect(updateRoleMock).not.toHaveBeenCalled()
  })

  it('loads role detail and submits updates in edit mode', async () => {
    getRoleMock.mockResolvedValue(roleResponse)
    updateRoleMock.mockResolvedValue({
      ...roleResponse,
      name: '运营负责人',
    })

    const wrapper = mountDrawer({ show: true, roleId })
    await flushPromises()

    expect(wrapper.text()).toContain('编辑系统角色')
    expect(getResourceTreeOptionsMock).toHaveBeenCalledWith([directoryResourceId, actionResourceId])
    expect(getRoleMock).toHaveBeenCalledWith(roleId)
    expect(wrapper.getComponent(NTree).props('checkedKeys')).toEqual([
      directoryResourceId,
      actionResourceId,
    ])

    await wrapper.get('[data-test="role-form-name"] input').setValue('运营负责人')
    await submitForm(wrapper)

    expect(updateRoleMock).toHaveBeenCalledWith(roleId, {
      name: '运营负责人',
      code: 'operator',
      status: ROLE_STATUS_ENABLED,
      sortOrder: 2,
      resourceIds: [directoryResourceId, actionResourceId],
    })
    expect(wrapper.emitted('saved')).toHaveLength(1)
    expect(wrapper.emitted('update:show')).toEqual([[false]])
  })

  it('adds parent resources when selecting a child resource', async () => {
    createRoleMock.mockResolvedValue(roleResponse)

    const wrapper = mountDrawer()
    await flushPromises()

    await wrapper.get('[data-test="role-form-name"] input').setValue('运营')
    await wrapper.get('[data-test="role-form-code"] input').setValue('operator')
    wrapper
      .get('[data-test="role-form-resources"]')
      .getComponent(NTree)
      .vm.$emit('update:checkedKeys', [actionResourceId])
    await flushPromises()

    expect(wrapper.getComponent(NTree).props('checkedKeys')).toEqual([
      directoryResourceId,
      actionResourceId,
    ])
    expect(wrapper.text()).not.toContain('子级权限资源需要包含所有上级权限资源')

    await submitForm(wrapper)

    expect(createRoleMock).toHaveBeenCalledWith({
      name: '运营',
      code: 'operator',
      status: ROLE_STATUS_ENABLED,
      sortOrder: 0,
      resourceIds: [directoryResourceId, actionResourceId],
    })
    expect(wrapper.emitted('saved')).toHaveLength(1)
  })

  it('removes child resources when unchecking a parent resource', async () => {
    getRoleMock.mockResolvedValue(roleResponse)
    updateRoleMock.mockResolvedValue({
      ...roleResponse,
      resources: [],
    })

    const wrapper = mountDrawer({ show: true, roleId })
    await flushPromises()

    wrapper
      .get('[data-test="role-form-resources"]')
      .getComponent(NTree)
      .vm.$emit('update:checkedKeys', [actionResourceId])
    await flushPromises()

    expect(wrapper.getComponent(NTree).props('checkedKeys')).toEqual([])

    await submitForm(wrapper)

    expect(updateRoleMock).toHaveBeenCalledWith(roleId, {
      name: '运营',
      code: 'operator',
      status: ROLE_STATUS_ENABLED,
      sortOrder: 2,
      resourceIds: [],
    })
  })

  it('keeps parent resources when unchecking a child resource', async () => {
    getRoleMock.mockResolvedValue(roleResponse)
    updateRoleMock.mockResolvedValue({
      ...roleResponse,
      resources: [
        {
          id: directoryResourceId,
          name: '系统管理',
          code: 'system',
          type: RESOURCE_TYPE_DIRECTORY,
        },
      ],
    })

    const wrapper = mountDrawer({ show: true, roleId })
    await flushPromises()

    wrapper
      .get('[data-test="role-form-resources"]')
      .getComponent(NTree)
      .vm.$emit('update:checkedKeys', [directoryResourceId])
    await flushPromises()

    expect(wrapper.getComponent(NTree).props('checkedKeys')).toEqual([directoryResourceId])

    await submitForm(wrapper)

    expect(updateRoleMock).toHaveBeenCalledWith(roleId, {
      name: '运营',
      code: 'operator',
      status: ROLE_STATUS_ENABLED,
      sortOrder: 2,
      resourceIds: [directoryResourceId],
    })
  })

  it('allows submitting a parent resource without child resources', async () => {
    createRoleMock.mockResolvedValue(roleResponse)

    const wrapper = mountDrawer()
    await flushPromises()

    await wrapper.get('[data-test="role-form-name"] input').setValue('运营')
    await wrapper.get('[data-test="role-form-code"] input').setValue('operator')
    wrapper
      .get('[data-test="role-form-resources"]')
      .getComponent(NTree)
      .vm.$emit('update:checkedKeys', [directoryResourceId])
    await flushPromises()

    await submitForm(wrapper)

    expect(createRoleMock).toHaveBeenCalledWith({
      name: '运营',
      code: 'operator',
      status: ROLE_STATUS_ENABLED,
      sortOrder: 0,
      resourceIds: [directoryResourceId],
    })
    expect(wrapper.emitted('saved')).toHaveLength(1)
  })

  it('shows a field-level server error when create fails', async () => {
    createRoleMock.mockRejectedValue(new ApiRequestError(409, '编码已存在', 'code'))

    const wrapper = mountDrawer()
    await flushPromises()

    await wrapper.get('[data-test="role-form-name"] input').setValue('运营')
    await wrapper.get('[data-test="role-form-code"] input').setValue('operator')
    wrapper.getComponent(NSelect).vm.$emit('update:value', ROLE_STATUS_ENABLED)
    wrapper.getComponent(NInputNumber).vm.$emit('update:value', 2)
    await flushPromises()

    await submitForm(wrapper)

    expect(createRoleMock).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('编码已存在')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('ignores stale mutation errors from a previous create session', async () => {
    const pendingCreate = deferred<Role>()
    createRoleMock.mockImplementationOnce(() => pendingCreate.promise)

    const wrapper = mountDrawer()
    await flushPromises()

    await wrapper.get('[data-test="role-form-name"] input').setValue('旧会话')
    await wrapper.get('[data-test="role-form-code"] input').setValue('stale-role')
    await submitForm(wrapper)

    expect(createRoleMock).toHaveBeenCalledTimes(1)

    await wrapper.setProps({ show: false, roleId: null })
    await flushPromises()
    await wrapper.setProps({ show: true, roleId: null })
    await flushPromises()

    await wrapper.get('[data-test="role-form-name"] input').setValue('新会话')
    await wrapper.get('[data-test="role-form-code"] input').setValue('fresh-role')

    pendingCreate.reject(new ApiRequestError(400, '旧会话错误', 'code'))
    await flushPromises()

    const codeFieldContainer = wrapper
      .get('[data-test="role-form-code"]')
      .element.closest('.n-form-item')

    expect(codeFieldContainer?.textContent).not.toContain('旧会话错误')
    expect(wrapper.text()).not.toContain('旧会话错误')
    expect(wrapper.emitted('saved')).toBeUndefined()
    expect(wrapper.emitted('update:show')).toBeUndefined()
  })

  it('does not submit create mode with empty required fields and shows validation feedback', async () => {
    const wrapper = mountDrawer()
    await flushPromises()

    await submitForm(wrapper)

    expect(createRoleMock).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('请输入名称')
    expect(wrapper.text()).toContain('请输入编码')
    expect(wrapper.text()).not.toContain('保存角色失败')
  })

  it('ignores stale role load responses after switching to another role', async () => {
    const firstRoleRequest = deferred<Role>()
    const secondRoleRequest = deferred<Role>()

    getRoleMock.mockImplementation((id: string) => {
      if (id === roleId) {
        return firstRoleRequest.promise
      }

      if (id === secondRoleId) {
        return secondRoleRequest.promise
      }

      throw new Error(`Unexpected role id: ${id}`)
    })
    updateRoleMock.mockResolvedValue(secondRoleResponse)

    const wrapper = mountDrawer({ show: true, roleId })
    await flushPromises()

    await wrapper.setProps({ show: true, roleId: secondRoleId })
    await flushPromises()

    secondRoleRequest.resolve(secondRoleResponse)
    await flushPromises()

    expect(wrapper.get('[data-test="role-form-name"] input').element).toHaveProperty(
      'value',
      '审计',
    )
    expect(wrapper.getComponent(NTree).props('checkedKeys')).toEqual([
      directoryResourceId,
      secondActionResourceId,
    ])

    firstRoleRequest.resolve(roleResponse)
    await flushPromises()

    expect(wrapper.get('[data-test="role-form-name"] input').element).toHaveProperty(
      'value',
      '审计',
    )
    expect(wrapper.getComponent(NTree).props('checkedKeys')).toEqual([
      directoryResourceId,
      secondActionResourceId,
    ])

    await submitForm(wrapper)

    expect(updateRoleMock).toHaveBeenCalledWith(secondRoleId, {
      name: '审计',
      code: 'auditor',
      status: ROLE_STATUS_ENABLED,
      sortOrder: 5,
      resourceIds: [directoryResourceId, secondActionResourceId],
    })
  })

  it('does not emit saved or close the current drawer when a stale save resolves', async () => {
    const pendingSave = deferred<Role>()

    getRoleMock.mockImplementation((id: string) => {
      if (id === roleId) {
        return Promise.resolve(roleResponse)
      }

      if (id === secondRoleId) {
        return Promise.resolve(secondRoleResponse)
      }

      throw new Error(`Unexpected role id: ${id}`)
    })
    updateRoleMock.mockImplementation((id: string) => {
      if (id !== roleId) {
        throw new Error(`Unexpected save id: ${id}`)
      }

      return pendingSave.promise
    })

    const wrapper = mountDrawer({ show: true, roleId })
    await flushPromises()

    await wrapper.get('[data-test="role-form-name"] input').setValue('运营负责人')
    await submitForm(wrapper)

    expect(updateRoleMock).toHaveBeenCalledWith(roleId, {
      name: '运营负责人',
      code: 'operator',
      status: ROLE_STATUS_ENABLED,
      sortOrder: 2,
      resourceIds: [directoryResourceId, actionResourceId],
    })

    await wrapper.setProps({ show: true, roleId: secondRoleId })
    await flushPromises()

    expect(wrapper.get('[data-test="role-form-name"] input').element).toHaveProperty(
      'value',
      '审计',
    )
    expect(wrapper.getComponent(NTree).props('checkedKeys')).toEqual([
      directoryResourceId,
      secondActionResourceId,
    ])

    pendingSave.resolve({
      ...roleResponse,
      name: '运营负责人',
    })
    await flushPromises()

    expect(wrapper.emitted('saved')).toBeUndefined()
    expect(wrapper.emitted('update:show')).toBeUndefined()
    expect(wrapper.props('show')).toBe(true)
    expect(wrapper.props('roleId')).toBe(secondRoleId)
    expect(wrapper.get('[data-test="role-form-name"] input').element).toHaveProperty(
      'value',
      '审计',
    )
  })

  it('does not submit while switching to a role that is still loading', async () => {
    const pendingRoleLoad = deferred<Role>()

    getRoleMock.mockImplementation((id: string) => {
      if (id === roleId) {
        return Promise.resolve(roleResponse)
      }

      if (id === secondRoleId) {
        return pendingRoleLoad.promise
      }

      throw new Error(`Unexpected role id: ${id}`)
    })

    const wrapper = mountDrawer({ show: true, roleId })
    await flushPromises()

    expect(wrapper.get('[data-test="role-form-name"] input').element).toHaveProperty(
      'value',
      '运营',
    )

    await wrapper.setProps({ show: true, roleId: secondRoleId })
    await flushPromises()

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(updateRoleMock).not.toHaveBeenCalled()

    pendingRoleLoad.resolve(secondRoleResponse)
    await flushPromises()
  })
})
