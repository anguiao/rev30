// @vitest-environment happy-dom

import { PiniaColada } from '@pinia/colada'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NSelect, NTreeSelect } from 'naive-ui'
import {
  DEPARTMENT_STATUS_DISABLED,
  DEPARTMENT_STATUS_ENABLED,
  ROLE_STATUS_DISABLED,
  ROLE_STATUS_ENABLED,
  type DepartmentTreeNode,
  type RoleOptionsResponse,
  type UserCreateResponse,
  USER_STATUS_ENABLED,
  type User,
  type UserStatus,
} from '@rev30/shared'
import {
  createUser,
  getDepartmentTreeOptions,
  getRoleOptions,
  getUser,
  SystemRequestError,
  updateUser,
} from '../../../src/features/system'
import UserFormDrawer from '../../../src/features/system/UserFormDrawer.vue'
import { createPinia, setActivePinia } from 'pinia'

enableAutoUnmount(afterEach)

vi.mock('../../../src/features/system', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/system')>()),
  createUser: vi.fn(),
  getDepartmentTreeOptions: vi.fn(),
  getRoleOptions: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
}))

const createUserMock = vi.mocked(createUser)
const getDepartmentTreeOptionsMock = vi.mocked(getDepartmentTreeOptions)
const getRoleOptionsMock = vi.mocked(getRoleOptions)
const getUserMock = vi.mocked(getUser)
const updateUserMock = vi.mocked(updateUser)

const userId = '11111111-1111-4111-8111-111111111111'
const roleId = '22222222-2222-4222-8222-222222222222'
const secondRoleId = '33333333-3333-4333-8333-333333333333'
const departmentId = '44444444-4444-4444-8444-444444444444'
const secondDepartmentId = '55555555-5555-4555-8555-555555555555'

const departmentTreeResponse: DepartmentTreeNode[] = [
  {
    id: departmentId,
    parentId: null,
    name: '研发部',
    code: 'rd',
    status: DEPARTMENT_STATUS_ENABLED,
    sortOrder: 1,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    children: [
      {
        id: secondDepartmentId,
        parentId: departmentId,
        name: '前端组',
        code: 'frontend',
        status: DEPARTMENT_STATUS_DISABLED,
        sortOrder: 1,
        createdAt: '2026-05-02T00:00:00.000Z',
        updatedAt: '2026-05-02T00:00:00.000Z',
        children: [],
      },
    ],
  },
]

const roleOptionsResponse: RoleOptionsResponse = [
  {
    id: roleId,
    name: '管理员',
    code: 'admin',
    status: ROLE_STATUS_ENABLED,
  },
  {
    id: secondRoleId,
    name: '审核员',
    code: 'auditor',
    status: ROLE_STATUS_DISABLED,
  },
]

const userResponse: User = {
  id: userId,
  username: 'ada',
  nickname: 'Ada',
  email: 'ada@example.com',
  phone: '13800138000',
  status: USER_STATUS_ENABLED as UserStatus,
  builtIn: false,
  departments: [
    {
      id: departmentId,
      name: '研发部',
      code: 'rd',
    },
  ],
  roles: [
    {
      id: roleId,
      name: '管理员',
      code: 'admin',
    },
  ],
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
}

const userCreateResponse: UserCreateResponse = {
  user: {
    ...userResponse,
    username: 'new-user',
    nickname: 'New User',
    email: null,
    phone: null,
    departments: [],
    roles: [],
  },
  temporaryPassword: 'TempPass123',
}

function mountDrawer(props?: { show?: boolean; userId?: string | null }) {
  const pinia = createPinia()
  setActivePinia(pinia)

  return mount(UserFormDrawer, {
    props: {
      show: props?.show ?? true,
      userId: props === undefined || !('userId' in props) ? userId : props.userId,
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
  await wrapper.get('[data-test="user-form-submit"]').trigger('click')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

describe('UserFormDrawer', () => {
  beforeEach(() => {
    createUserMock.mockReset()
    getDepartmentTreeOptionsMock.mockReset()
    getRoleOptionsMock.mockReset()
    getUserMock.mockReset()
    updateUserMock.mockReset()

    getDepartmentTreeOptionsMock.mockResolvedValue(departmentTreeResponse)
    getRoleOptionsMock.mockResolvedValue(roleOptionsResponse)
  })

  it('loads departments and roles in create mode and submits a new user', async () => {
    createUserMock.mockResolvedValue(userCreateResponse)

    const wrapper = mountDrawer({ userId: null })
    await flushPromises()

    expect(wrapper.text()).toContain('新增系统用户')
    expect(getDepartmentTreeOptionsMock).toHaveBeenCalledWith()
    expect(getRoleOptionsMock).toHaveBeenCalledWith()
    expect(getUserMock).not.toHaveBeenCalled()
    expect(wrapper.getComponent(NTreeSelect).props('options')).toEqual([
      {
        key: departmentId,
        label: '研发部 (rd)',
        disabled: false,
        children: [
          {
            key: secondDepartmentId,
            label: '前端组 (frontend)',
            disabled: true,
          },
        ],
      },
    ])
    expect(
      wrapper.get('[data-test="user-form-roles"]').getComponent(NSelect).props('options'),
    ).toEqual([
      {
        label: '管理员 (admin)',
        value: roleId,
        disabled: false,
      },
      {
        label: '审核员 (auditor)',
        value: secondRoleId,
        disabled: true,
      },
    ])

    await wrapper.get('[data-test="user-form-username"] input').setValue('new-user')
    await wrapper.get('[data-test="user-form-nickname"] input').setValue('New User')
    await submitForm(wrapper)

    expect(createUserMock).toHaveBeenCalledWith({
      username: 'new-user',
      nickname: 'New User',
      email: null,
      phone: null,
      status: USER_STATUS_ENABLED,
      departmentIds: [],
      roleIds: [],
    })
    expect(wrapper.emitted('saved')).toEqual([[userCreateResponse]])
    expect(wrapper.emitted('update:show')).toEqual([[false]])
  })

  it('shows a load error and disables submit when create form options fail to load', async () => {
    getDepartmentTreeOptionsMock.mockRejectedValue(new Error('network'))

    const wrapper = mountDrawer({ userId: null })
    await flushPromises()

    expect(wrapper.text()).toContain('加载系统用户信息失败')
    expect(wrapper.get('[data-test="user-form-submit"]').attributes('disabled')).toBeDefined()

    await wrapper.get('[data-test="user-form-username"] input').setValue('blocked-user')
    await wrapper.get('[data-test="user-form-nickname"] input').setValue('Blocked User')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(createUserMock).not.toHaveBeenCalled()
    expect(updateUserMock).not.toHaveBeenCalled()
  })

  it('loads user detail, departments and roles and submits updated fields', async () => {
    getUserMock.mockResolvedValue(userResponse)
    updateUserMock.mockResolvedValue(userResponse)

    const wrapper = mountDrawer()
    await flushPromises()

    expect(wrapper.text()).toContain('编辑系统用户')
    expect(getDepartmentTreeOptionsMock).toHaveBeenCalledWith({
      includeIds: [departmentId],
    })
    expect(getRoleOptionsMock).toHaveBeenCalledWith({
      includeIds: [roleId],
    })
    expect(getUserMock).toHaveBeenCalledWith(userId)
    const departmentTreeSelect = wrapper.getComponent(NTreeSelect)

    await wrapper.get('[data-test="user-form-nickname"] input').setValue('Ada Lovelace')
    departmentTreeSelect.vm.$emit('update:value', [secondDepartmentId])
    wrapper
      .get('[data-test="user-form-roles"]')
      .getComponent(NSelect)
      .vm.$emit('update:value', [secondRoleId])
    await flushPromises()

    await submitForm(wrapper)

    expect(updateUserMock).toHaveBeenCalledWith(userId, {
      username: 'ada',
      nickname: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '13800138000',
      status: USER_STATUS_ENABLED,
      departmentIds: [secondDepartmentId],
      roleIds: [secondRoleId],
    })
    expect(wrapper.emitted('saved')).toHaveLength(1)
    expect(wrapper.emitted('update:show')).toEqual([[false]])
  })

  it('shows a field-level error when the username is already used', async () => {
    getUserMock.mockResolvedValue(userResponse)
    updateUserMock.mockRejectedValue(new SystemRequestError(409, '用户名已存在', 'username'))

    const wrapper = mountDrawer()
    await flushPromises()

    await wrapper.get('[data-test="user-form-username"] input').setValue('ada_new')
    await submitForm(wrapper)

    expect(updateUserMock).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('用户名已存在')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('submits empty departmentIds when tree select emits null', async () => {
    createUserMock.mockResolvedValue(userCreateResponse)

    const wrapper = mountDrawer({ userId: null })
    await flushPromises()

    await wrapper.get('[data-test="user-form-username"] input').setValue('new-user')
    await wrapper.get('[data-test="user-form-nickname"] input').setValue('New User')
    wrapper.getComponent(NTreeSelect).vm.$emit('update:value', null)
    await flushPromises()

    await submitForm(wrapper)

    expect(createUserMock).toHaveBeenCalledWith({
      username: 'new-user',
      nickname: 'New User',
      email: null,
      phone: null,
      status: USER_STATUS_ENABLED,
      departmentIds: [],
      roleIds: [],
    })
  })
})
