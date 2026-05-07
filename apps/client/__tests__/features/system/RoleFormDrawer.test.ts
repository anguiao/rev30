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
const roleId = '33333333-3333-4333-8333-333333333333'

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

    await wrapper.get('[data-test="role-form-name"] input').setValue('运营')
    await wrapper.get('[data-test="role-form-code"] input').setValue('operator')
    wrapper.getComponent(NInputNumber).vm.$emit('update:value', 2)
    wrapper.getComponent(NTree).vm.$emit('update:checkedKeys', [actionResourceId])
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
})
