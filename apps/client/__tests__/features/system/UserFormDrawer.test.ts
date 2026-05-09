// @vitest-environment happy-dom

import { PiniaColada } from '@pinia/colada'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NSelect, NTree } from 'naive-ui'
import {
  DEPARTMENT_STATUS_ENABLED,
  type DepartmentTreeNode,
  type RoleListResponse,
  type UserCreateResponse,
  USER_STATUS_DISABLED,
  USER_STATUS_ENABLED,
  type User,
  type UserStatus,
} from '@rev30/shared'
import {
  createUser,
  getDepartmentTree,
  getUser,
  listRoles,
  SystemRequestError,
  updateUser,
} from '../../../src/features/system'
import UserFormDrawer from '../../../src/features/system/UserFormDrawer.vue'
import { createPinia, setActivePinia } from 'pinia'

enableAutoUnmount(afterEach)

vi.mock('../../../src/features/system', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/system')>()),
  createUser: vi.fn(),
  getDepartmentTree: vi.fn(),
  getUser: vi.fn(),
  listRoles: vi.fn(),
  updateUser: vi.fn(),
}))

const createUserMock = vi.mocked(createUser)
const getDepartmentTreeMock = vi.mocked(getDepartmentTree)
const getUserMock = vi.mocked(getUser)
const listRolesMock = vi.mocked(listRoles)
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
        status: DEPARTMENT_STATUS_ENABLED,
        sortOrder: 1,
        createdAt: '2026-05-02T00:00:00.000Z',
        updatedAt: '2026-05-02T00:00:00.000Z',
        children: [],
      },
    ],
  },
]

const roleListResponse: RoleListResponse = {
  page: 1,
  pageSize: 100,
  total: 2,
  list: [
    {
      id: roleId,
      name: '管理员',
      code: 'admin',
      status: USER_STATUS_ENABLED,
      sortOrder: 1,
      userCount: 2,
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
    },
    {
      id: secondRoleId,
      name: '审核员',
      code: 'auditor',
      status: USER_STATUS_DISABLED,
      sortOrder: 2,
      userCount: 1,
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
    },
  ],
}

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
    getDepartmentTreeMock.mockReset()
    getUserMock.mockReset()
    listRolesMock.mockReset()
    updateUserMock.mockReset()

    getDepartmentTreeMock.mockResolvedValue(departmentTreeResponse)
    listRolesMock.mockResolvedValue(roleListResponse)
  })

  it('loads departments and roles in create mode and submits a new user', async () => {
    createUserMock.mockResolvedValue(userCreateResponse)

    const wrapper = mountDrawer({ userId: null })
    await flushPromises()

    expect(wrapper.text()).toContain('新增用户')
    expect(getDepartmentTreeMock).toHaveBeenCalledTimes(1)
    expect(listRolesMock).toHaveBeenCalledWith({ page: 1, pageSize: 100 })
    expect(getUserMock).not.toHaveBeenCalled()
    expect(wrapper.getComponent(NTree).props('data')).toEqual([
      {
        key: departmentId,
        label: '研发部 (rd)',
        children: [
          {
            key: secondDepartmentId,
            label: '前端组 (frontend)',
          },
        ],
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

  it('loads user detail, departments and roles and submits updated fields', async () => {
    getUserMock.mockResolvedValue(userResponse)
    updateUserMock.mockResolvedValue(userResponse)

    const wrapper = mountDrawer()
    await flushPromises()

    expect(wrapper.text()).toContain('编辑用户')
    expect(getDepartmentTreeMock).toHaveBeenCalledTimes(1)
    expect(listRolesMock).toHaveBeenCalledWith({ page: 1, pageSize: 100 })
    expect(getUserMock).toHaveBeenCalledWith(userId)
    expect(wrapper.getComponent(NTree).props('data')).toEqual([
      {
        key: departmentId,
        label: '研发部 (rd)',
        children: [
          {
            key: secondDepartmentId,
            label: '前端组 (frontend)',
          },
        ],
      },
    ])
    expect(wrapper.getComponent(NTree).props('checkedKeys')).toEqual([departmentId])

    await wrapper.get('[data-test="user-form-nickname"] input').setValue('Ada Lovelace')
    wrapper
      .get('[data-test="user-form-departments"]')
      .getComponent(NTree)
      .vm.$emit('update:checkedKeys', [secondDepartmentId])
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
})
