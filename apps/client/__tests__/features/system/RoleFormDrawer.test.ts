// @vitest-environment happy-dom

import { PiniaColada } from '@pinia/colada'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NInputNumber, NSelect, NTree } from 'naive-ui'
import {
  RESOURCE_OPEN_TARGET_SELF,
  RESOURCE_STATUS_ENABLED,
  RESOURCE_TYPE_ACTION,
  RESOURCE_TYPE_DIRECTORY,
  ROLE_STATUS_ENABLED,
  type ResourceTreeNode,
  type Role,
} from '@rev30/shared'
import {
  createRole,
  getRole,
  getResourceTree,
  SystemRequestError,
  updateRole,
} from '../../../src/features/system'
import RoleFormDrawer from '../../../src/features/system/RoleFormDrawer.vue'
import { createPinia, setActivePinia } from 'pinia'

enableAutoUnmount(afterEach)

vi.mock('../../../src/features/system', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/system')>()),
  createRole: vi.fn(),
  getResourceTree: vi.fn(),
  getRole: vi.fn(),
  updateRole: vi.fn(),
}))

const createRoleMock = vi.mocked(createRole)
const getResourceTreeMock = vi.mocked(getResourceTree)
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
        status: RESOURCE_STATUS_ENABLED,
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
      id: actionResourceId,
      name: '角色保存',
      code: 'system:role:save',
      type: RESOURCE_TYPE_ACTION,
    },
  ],
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
}

const secondRoleResponse: Role = {
  id: secondRoleId,
  name: '审计',
  code: 'auditor',
  status: ROLE_STATUS_ENABLED,
  sortOrder: 5,
  resources: [
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
    getResourceTreeMock.mockReset()
    getRoleMock.mockReset()
    updateRoleMock.mockReset()

    getResourceTreeMock.mockResolvedValue(resourceTreeResponse)
  })

  it('submits a new role in create mode', async () => {
    createRoleMock.mockResolvedValue(roleResponse)

    const wrapper = mountDrawer()
    await flushPromises()

    expect(wrapper.text()).toContain('新增角色')
    expect(getResourceTreeMock).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[data-test="role-form-resources"]').attributes('data-test')).toBe(
      'role-form-resources',
    )

    await wrapper.get('[data-test="role-form-name"] input').setValue('运营')
    await wrapper.get('[data-test="role-form-code"] input').setValue('operator')
    wrapper.getComponent(NInputNumber).vm.$emit('update:value', 2)
    wrapper.get('[data-test="role-form-resources"]').getComponent(NTree).vm.$emit(
      'update:checkedKeys',
      [actionResourceId],
    )
    await flushPromises()

    await submitForm(wrapper)

    expect(createRoleMock).toHaveBeenCalledWith({
      name: '运营',
      code: 'operator',
      status: ROLE_STATUS_ENABLED,
      sortOrder: 2,
      resourceIds: [actionResourceId],
    })
    expect(wrapper.emitted('saved')).toHaveLength(1)
    expect(wrapper.emitted('update:show')).toEqual([[false]])
  })

  it('loads role detail and submits updates in edit mode', async () => {
    getRoleMock.mockResolvedValue(roleResponse)
    updateRoleMock.mockResolvedValue({
      ...roleResponse,
      name: '运营负责人',
    })

    const wrapper = mountDrawer({ show: true, roleId })
    await flushPromises()

    expect(wrapper.text()).toContain('编辑角色')
    expect(getResourceTreeMock).toHaveBeenCalledTimes(1)
    expect(getRoleMock).toHaveBeenCalledWith(roleId)
    expect(wrapper.getComponent(NTree).props('checkedKeys')).toEqual([actionResourceId])

    await wrapper.get('[data-test="role-form-name"] input').setValue('运营负责人')
    await submitForm(wrapper)

    expect(updateRoleMock).toHaveBeenCalledWith(roleId, {
      name: '运营负责人',
      code: 'operator',
      status: ROLE_STATUS_ENABLED,
      sortOrder: 2,
      resourceIds: [actionResourceId],
    })
    expect(wrapper.emitted('saved')).toHaveLength(1)
    expect(wrapper.emitted('update:show')).toEqual([[false]])
  })

  it('shows a field-level server error when create fails', async () => {
    createRoleMock.mockRejectedValue(new SystemRequestError(409, '角色编码已存在', 'code'))

    const wrapper = mountDrawer()
    await flushPromises()

    await wrapper.get('[data-test="role-form-name"] input').setValue('运营')
    await wrapper.get('[data-test="role-form-code"] input').setValue('operator')
    wrapper.getComponent(NSelect).vm.$emit('update:value', ROLE_STATUS_ENABLED)
    wrapper.getComponent(NInputNumber).vm.$emit('update:value', 2)
    await flushPromises()

    await submitForm(wrapper)

    expect(createRoleMock).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('角色编码已存在')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('does not submit create mode with empty required fields and shows validation feedback', async () => {
    const wrapper = mountDrawer()
    await flushPromises()

    await submitForm(wrapper)

    expect(createRoleMock).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('请输入角色名称')
    expect(wrapper.text()).toContain('请输入角色编码')
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
    expect(wrapper.getComponent(NTree).props('checkedKeys')).toEqual([secondActionResourceId])

    firstRoleRequest.resolve(roleResponse)
    await flushPromises()

    expect(wrapper.get('[data-test="role-form-name"] input').element).toHaveProperty(
      'value',
      '审计',
    )
    expect(wrapper.getComponent(NTree).props('checkedKeys')).toEqual([secondActionResourceId])

    await submitForm(wrapper)

    expect(updateRoleMock).toHaveBeenCalledWith(secondRoleId, {
      name: '审计',
      code: 'auditor',
      status: ROLE_STATUS_ENABLED,
      sortOrder: 5,
      resourceIds: [secondActionResourceId],
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
      resourceIds: [actionResourceId],
    })

    await wrapper.setProps({ show: true, roleId: secondRoleId })
    await flushPromises()

    expect(wrapper.get('[data-test="role-form-name"] input').element).toHaveProperty(
      'value',
      '审计',
    )
    expect(wrapper.getComponent(NTree).props('checkedKeys')).toEqual([secondActionResourceId])

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
