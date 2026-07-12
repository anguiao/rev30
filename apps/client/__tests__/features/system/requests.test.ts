import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEPARTMENT_STATUS_ENABLED,
  DICTIONARY_STATUS_ENABLED,
  type DictionaryCreateInput,
  type DictionaryUpdateInput,
  RESOURCE_OPEN_TARGET_SELF,
  RESOURCE_STATUS_ENABLED,
  RESOURCE_TYPE_DIRECTORY,
  RESOURCE_TYPE_MENU,
  ROLE_STATUS_ENABLED,
  USER_STATUS_ENABLED,
} from '@rev30/contracts'
import {
  createResource,
  createRole,
  deleteRole,
  deleteResource,
  deleteUser,
  createDepartment,
  deleteDepartment,
  getDepartment,
  getResource,
  getRole,
  getConfig,
  listConfigs,
  updateConfig,
  createUser,
  getUser,
  getUserOptions,
  getDepartmentTree,
  getDepartmentTreeOptions,
  resetUserPassword,
  updateDepartment,
  getResourceTree,
  getResourceTreeOptions,
  getRoleOptions,
  listDictionaries,
  getDictionary,
  createDictionary,
  updateDictionary,
  deleteDictionary,
  getDictionaryOptions,
  searchIcons,
  listRoles,
  listUsers,
  updateResource,
  updateRole,
  updateUser,
} from '../../../src/features/system'
import { useAuthStore } from '../../../src/stores/auth'
import {
  createFetchMock,
  emptyResponse,
  expectFetchCall,
  expectJsonBody,
  jsonResponse,
} from '../../helpers/fetch'
import { createTestPinia } from '../../helpers/pinia'

beforeEach(() => {
  createTestPinia()
})

const userCreateInput = {
  avatarId: null,
  username: 'ada',
  nickname: 'Ada',
  email: null,
  phone: null,
  status: USER_STATUS_ENABLED,
  departmentIds: [],
  roleIds: [],
} satisfies Parameters<typeof createUser>[0]

const dictionaryId = '11111111-1111-4111-8111-111111111111'
const dictionaryItemId = '11111111-1111-4111-8111-111111111112'
const dictionaryListResponse = {
  list: [
    {
      id: dictionaryId,
      code: 'user_status',
      name: '用户状态',
      description: '用户状态字典',
      status: DICTIONARY_STATUS_ENABLED,
      sortOrder: 1,
      itemCount: 2,
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
    },
  ],
  total: 1,
  page: 1,
  pageSize: 20,
}
const dictionaryDetailResponse = {
  id: dictionaryId,
  code: 'user_status',
  name: '用户状态',
  description: '用户状态字典',
  status: DICTIONARY_STATUS_ENABLED,
  sortOrder: 1,
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
  items: [
    {
      id: dictionaryItemId,
      typeId: dictionaryId,
      label: '启用',
      value: 'enabled',
      description: null,
      status: DICTIONARY_STATUS_ENABLED,
      sortOrder: 0,
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
    },
  ],
}
const dictionaryCreateInput: DictionaryCreateInput = {
  code: 'region',
  name: '地区',
  description: null,
  status: 1,
  sortOrder: 0,
  items: [],
}
const dictionaryCreateResponse = {
  ...dictionaryDetailResponse,
  id: '11111111-1111-4111-8111-111111111113',
  name: '地区',
  code: 'region',
}
const dictionaryUpdateInput: DictionaryUpdateInput = {
  code: 'user_status',
  name: '地区字典',
  description: null,
  status: 1,
  sortOrder: 1,
  items: [
    {
      id: dictionaryItemId,
      label: '启用',
      value: 'enabled',
      description: null,
      status: 1,
      sortOrder: 0,
    },
  ],
}
const dictionaryUpdateResponse = {
  ...dictionaryCreateResponse,
  name: '地区字典',
}
const dictionaryOptionsResponse = {
  user_status: [{ value: 'enabled', label: '启用' }],
  region: [{ value: 'north', label: '北区' }],
}
const roleRequestId = '11111111-1111-4111-8111-111111111111'
const roleRequestResponse = {
  id: roleRequestId,
  name: '运营',
  code: 'operator',
  status: ROLE_STATUS_ENABLED,
  sortOrder: 1,
  resources: [],
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
}
const updatedRoleRequestResponse = {
  ...roleRequestResponse,
  name: '运营主管',
  sortOrder: 2,
  updatedAt: '2026-05-02T00:00:00.000Z',
}
const roleCreateInput = {
  name: '运营',
  code: 'operator',
  status: ROLE_STATUS_ENABLED,
  sortOrder: 1,
  resourceIds: [],
} satisfies Parameters<typeof createRole>[0]
const roleUpdateInput = {
  name: '运营主管',
  code: 'operator',
  status: ROLE_STATUS_ENABLED,
  sortOrder: 2,
  resourceIds: [],
} satisfies Parameters<typeof updateRole>[1]
const departmentRequestId = '22222222-2222-4222-8222-222222222222'
const departmentRequestResponse = {
  id: departmentRequestId,
  parentId: null,
  name: '总部',
  code: 'hq',
  status: DEPARTMENT_STATUS_ENABLED,
  sortOrder: 1,
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
}
const updatedDepartmentRequestResponse = {
  ...departmentRequestResponse,
  name: '研发中心',
  code: 'eng',
  sortOrder: 2,
  updatedAt: '2026-05-02T00:00:00.000Z',
}
const departmentCreateInput = {
  name: '总部',
  code: 'hq',
  parentId: null,
  status: DEPARTMENT_STATUS_ENABLED,
  sortOrder: 1,
} satisfies Parameters<typeof createDepartment>[0]
const departmentUpdateInput = {
  name: '研发中心',
  code: 'eng',
  parentId: null,
  status: DEPARTMENT_STATUS_ENABLED,
  sortOrder: 2,
} satisfies Parameters<typeof updateDepartment>[1]
const resourceRequestId = '44444444-4444-4444-8444-444444444444'
const resourceRequestResponse = {
  id: resourceRequestId,
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
}
const updatedResourceRequestResponse = {
  ...resourceRequestResponse,
  name: '权限资源',
  code: 'system:resource',
  updatedAt: '2026-05-02T00:00:00.000Z',
}
const resourceCreateInput = {
  type: RESOURCE_TYPE_DIRECTORY,
  name: '系统管理',
  code: 'system',
  parentId: null,
  path: null,
  externalUrl: null,
  openTarget: RESOURCE_OPEN_TARGET_SELF,
  icon: 'lucide:settings',
  hidden: false,
  status: RESOURCE_STATUS_ENABLED,
  sortOrder: 1,
} satisfies Parameters<typeof createResource>[0]
const resourceUpdateInput = {
  name: '权限资源',
  code: 'system:resource',
} satisfies Parameters<typeof updateResource>[1]
const userRequestId = '22222222-2222-2222-8222-222222222222'
const userRequestResponse = {
  id: userRequestId,
  username: 'ada',
  nickname: 'Ada',
  avatarId: null,
  email: null,
  phone: null,
  status: USER_STATUS_ENABLED,
  builtIn: false,
  departments: [],
  roles: [],
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
}
const updatedUserRequestResponse = {
  ...userRequestResponse,
  nickname: 'Ada Lovelace',
  email: 'ada@example.com',
  updatedAt: '2026-05-02T00:00:00.000Z',
}
const userUpdateInput = {
  avatarId: null,
  username: 'ada',
  nickname: 'Ada Lovelace',
  email: 'ada@example.com',
  phone: null,
  status: USER_STATUS_ENABLED,
  departmentIds: [],
  roleIds: [],
} satisfies Parameters<typeof updateUser>[1]

describe('system request helpers', () => {
  it('searches icons through the public icon endpoint', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({
        list: [
          {
            icon: 'lucide:users',
            prefix: 'lucide',
            name: 'users',
            collection: 'Lucide',
            palette: false,
          },
        ],
      }),
    )

    const result = await searchIcons({ keyword: '用户', limit: 20 })

    expect(result.list[0]?.icon).toBe('lucide:users')
    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/icons/search',
      query: {
        keyword: '用户',
        limit: '20',
      },
    })
  })

  it('parses list responses from the system users endpoint', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({
        list: [],
        total: 0,
        page: 1,
        pageSize: 20,
      }),
    )
    useAuthStore().accessToken = 'access-token'

    const result = await listUsers({
      page: 1,
      pageSize: 20,
      keyword: 'ada',
      status: USER_STATUS_ENABLED,
    })

    expect(result.total).toBe(0)
    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/system/users',
      query: {
        page: '1',
        pageSize: '20',
        keyword: 'ada',
        status: '1',
      },
    })
  })

  it('omits empty query values before sending requests', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({
        list: [],
        total: 0,
        page: 1,
        pageSize: 20,
      }),
    )
    useAuthStore().accessToken = 'access-token'

    await listUsers({
      page: 1,
      pageSize: 20,
      keyword: '',
      status: USER_STATUS_ENABLED,
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/system/users',
      query: {
        page: '1',
        pageSize: '20',
        keyword: undefined,
        status: '1',
      },
    })
  })

  it('lists registry-backed configs without query params', async () => {
    const fetchMock = createFetchMock(
      jsonResponse([
        {
          key: 'auth.loginFailureMaxAttempts',
          name: '登录失败最大次数（次）',
          description: '同一用户名在窗口期内允许的失败次数。',
          valueType: 'number',
          defaultValue: '5',
          customValue: null,
          value: '5',
        },
      ]),
    )
    useAuthStore().accessToken = 'access-token'

    await expect(listConfigs()).resolves.toEqual([
      expect.objectContaining({
        key: 'auth.loginFailureMaxAttempts',
        value: '5',
      }),
    ])
    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/system/configs',
    })
  })

  it('gets and updates config custom values by key', async () => {
    const response = {
      key: 'auth.loginFailureMaxAttempts',
      name: '登录失败最大次数（次）',
      description: '同一用户名在窗口期内允许的失败次数。',
      valueType: 'number',
      defaultValue: '5',
      customValue: '8',
      value: '8',
    }
    const fetchMock = createFetchMock(jsonResponse(response), jsonResponse(response))
    useAuthStore().accessToken = 'access-token'

    await expect(getConfig('auth.loginFailureMaxAttempts')).resolves.toEqual(response)
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/system/configs/auth.loginFailureMaxAttempts',
    })

    await expect(
      updateConfig('auth.loginFailureMaxAttempts', { customValue: '8' }),
    ).resolves.toEqual(response)
    expectFetchCall(fetchMock, 1, {
      method: 'PUT',
      pathname: '/api/system/configs/auth.loginFailureMaxAttempts',
    })
    expectJsonBody(fetchMock, 1, { customValue: '8' })
  })

  it('parses user options responses from the users options endpoint', async () => {
    const fetchMock = createFetchMock(
      jsonResponse([
        {
          id: '11111111-1111-4111-8111-111111111111',
          username: 'alice',
          nickname: 'Alice',
          status: USER_STATUS_ENABLED,
        },
      ]),
    )
    useAuthStore().accessToken = 'access-token'

    const result = await getUserOptions(['11111111-1111-4111-8111-111111111111'])

    expect(result[0]?.username).toBe('alice')
    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/system/users/options',
      query: {
        includeIds: '11111111-1111-4111-8111-111111111111',
      },
    })
  })

  it('omits includeIds when empty for user options requests', async () => {
    const fetchMock = createFetchMock(jsonResponse([]))
    useAuthStore().accessToken = 'access-token'

    await getUserOptions([])

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/system/users/options',
      query: {
        includeIds: undefined,
      },
    })
  })

  it('parses role options responses from the roles options endpoint', async () => {
    const fetchMock = createFetchMock(
      jsonResponse([
        {
          id: '22222222-2222-4222-8222-222222222222',
          name: '管理员',
          code: 'admin',
          status: ROLE_STATUS_ENABLED,
        },
      ]),
    )
    useAuthStore().accessToken = 'access-token'

    const result = await getRoleOptions(['22222222-2222-4222-8222-222222222222'])

    expect(result[0]?.name).toBe('管理员')
    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/system/roles/options',
      query: {
        includeIds: '22222222-2222-4222-8222-222222222222',
      },
    })
  })

  it('parses department tree options responses from the department tree options endpoint', async () => {
    const fetchMock = createFetchMock(
      jsonResponse([
        {
          id: '33333333-3333-4333-8333-333333333333',
          parentId: null,
          name: '总部',
          code: 'hq',
          status: DEPARTMENT_STATUS_ENABLED,
          children: [
            {
              id: '44444444-4444-4444-8444-444444444444',
              parentId: '33333333-3333-4333-8333-333333333333',
              name: '研发中心',
              code: 'eng',
              status: DEPARTMENT_STATUS_ENABLED,
              children: [],
            },
          ],
        },
      ]),
    )
    useAuthStore().accessToken = 'access-token'

    const result = await getDepartmentTreeOptions(['33333333-3333-4333-8333-333333333333'])

    expect(result[0]?.children[0]?.name).toBe('研发中心')
    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/system/departments/options/tree',
      query: {
        includeIds: '33333333-3333-4333-8333-333333333333',
      },
    })
  })

  it('parses resource tree options responses from the resource tree options endpoint', async () => {
    const fetchMock = createFetchMock(
      jsonResponse([
        {
          id: '55555555-5555-4555-8555-555555555555',
          parentId: null,
          type: RESOURCE_TYPE_MENU,
          name: '系统用户',
          code: 'system.users',
          status: RESOURCE_STATUS_ENABLED,
          children: [
            {
              id: '66666666-6666-4666-8666-666666666666',
              parentId: '55555555-5555-4555-8555-555555555555',
              type: RESOURCE_TYPE_MENU,
              name: '用户管理',
              code: 'system.users.list',
              status: RESOURCE_STATUS_ENABLED,
              children: [],
            },
          ],
        },
      ]),
    )
    useAuthStore().accessToken = 'access-token'

    const result = await getResourceTreeOptions(['55555555-5555-4555-8555-555555555555'])

    expect(result[0]?.children[0]?.code).toBe('system.users.list')
    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/system/resources/options/tree',
      query: {
        includeIds: '55555555-5555-4555-8555-555555555555',
      },
    })
  })

  it('parses list responses from the system roles endpoint', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({
        list: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            name: '管理员',
            code: 'admin',
            status: ROLE_STATUS_ENABLED,
            sortOrder: 1,
            userCount: 2,
            createdAt: '2026-05-01T00:00:00.000Z',
            updatedAt: '2026-05-01T00:00:00.000Z',
          },
        ],
        total: 1,
        page: 2,
        pageSize: 10,
      }),
    )
    useAuthStore().accessToken = 'access-token'

    const result = await listRoles({
      page: 2,
      pageSize: 10,
      keyword: 'admin',
      status: ROLE_STATUS_ENABLED,
    })

    expect(result.list[0]?.code).toBe('admin')
    expect(result.total).toBe(1)
    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/system/roles',
      query: {
        page: '2',
        pageSize: '10',
        keyword: 'admin',
        status: '1',
      },
    })
  })

  it('parses department tree responses from the system departments endpoint', async () => {
    const fetchMock = createFetchMock(
      jsonResponse([
        {
          id: '22222222-2222-4222-8222-222222222222',
          parentId: null,
          name: '总部',
          code: 'hq',
          status: DEPARTMENT_STATUS_ENABLED,
          sortOrder: 1,
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
          children: [
            {
              id: '33333333-3333-4333-8333-333333333333',
              parentId: '22222222-2222-4222-8222-222222222222',
              name: '研发中心',
              code: 'eng',
              status: DEPARTMENT_STATUS_ENABLED,
              sortOrder: 1,
              createdAt: '2026-05-02T00:00:00.000Z',
              updatedAt: '2026-05-02T00:00:00.000Z',
              children: [],
            },
          ],
        },
      ]),
    )
    useAuthStore().accessToken = 'access-token'

    const result = await getDepartmentTree()

    expect(result[0]?.children[0]?.code).toBe('eng')
    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/system/departments/tree',
    })
  })

  it('parses a department detail response', async () => {
    const fetchMock = createFetchMock(jsonResponse(departmentRequestResponse))
    useAuthStore().accessToken = 'access-token'

    await expect(getDepartment(departmentRequestId)).resolves.toEqual(departmentRequestResponse)

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: `/api/system/departments/${departmentRequestId}`,
    })
  })

  it('sends department create input and parses the created department', async () => {
    const fetchMock = createFetchMock(jsonResponse(departmentRequestResponse, { status: 201 }))
    useAuthStore().accessToken = 'access-token'

    await expect(createDepartment(departmentCreateInput)).resolves.toEqual(
      departmentRequestResponse,
    )

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'POST',
      pathname: '/api/system/departments',
    })
    expectJsonBody(fetchMock, 0, departmentCreateInput)
  })

  it('sends department update input and parses the updated department', async () => {
    const fetchMock = createFetchMock(jsonResponse(updatedDepartmentRequestResponse))
    useAuthStore().accessToken = 'access-token'

    await expect(updateDepartment(departmentRequestId, departmentUpdateInput)).resolves.toEqual(
      updatedDepartmentRequestResponse,
    )

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'PATCH',
      pathname: `/api/system/departments/${departmentRequestId}`,
    })
    expectJsonBody(fetchMock, 0, departmentUpdateInput)
  })

  it('deletes a department with an empty response', async () => {
    const fetchMock = createFetchMock(emptyResponse())
    useAuthStore().accessToken = 'access-token'

    await expect(deleteDepartment(departmentRequestId)).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'DELETE',
      pathname: `/api/system/departments/${departmentRequestId}`,
    })
  })

  it('parses resource tree responses from the system resources endpoint', async () => {
    const fetchMock = createFetchMock(
      jsonResponse([
        {
          id: '44444444-4444-4444-8444-444444444444',
          parentId: null,
          type: RESOURCE_TYPE_MENU,
          name: '系统用户',
          code: 'system.users',
          path: '/system/users',
          externalUrl: null,
          openTarget: 'self',
          icon: null,
          hidden: false,
          status: RESOURCE_STATUS_ENABLED,
          sortOrder: 1,
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
          children: [],
        },
      ]),
    )
    useAuthStore().accessToken = 'access-token'

    const result = await getResourceTree()

    expect(result[0]?.path).toBe('/system/users')
    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/system/resources/tree',
    })
  })

  it('parses a resource detail response', async () => {
    const fetchMock = createFetchMock(jsonResponse(resourceRequestResponse))
    useAuthStore().accessToken = 'access-token'

    await expect(getResource(resourceRequestId)).resolves.toEqual(resourceRequestResponse)

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: `/api/system/resources/${resourceRequestId}`,
    })
  })

  it('sends resource create input and parses the created resource', async () => {
    const fetchMock = createFetchMock(jsonResponse(resourceRequestResponse, { status: 201 }))
    useAuthStore().accessToken = 'access-token'

    await expect(createResource(resourceCreateInput)).resolves.toEqual(resourceRequestResponse)

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'POST',
      pathname: '/api/system/resources',
    })
    expectJsonBody(fetchMock, 0, resourceCreateInput)
  })

  it('sends resource update input and parses the updated resource', async () => {
    const fetchMock = createFetchMock(jsonResponse(updatedResourceRequestResponse))
    useAuthStore().accessToken = 'access-token'

    await expect(updateResource(resourceRequestId, resourceUpdateInput)).resolves.toEqual(
      updatedResourceRequestResponse,
    )

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'PATCH',
      pathname: `/api/system/resources/${resourceRequestId}`,
    })
    expectJsonBody(fetchMock, 0, resourceUpdateInput)
  })

  it('deletes a resource with an empty response', async () => {
    const fetchMock = createFetchMock(emptyResponse())
    useAuthStore().accessToken = 'access-token'

    await expect(deleteResource(resourceRequestId)).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'DELETE',
      pathname: `/api/system/resources/${resourceRequestId}`,
    })
  })

  it('parses system errors with field names', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({ field: 'code', message: '编码已存在' }, { status: 409 }),
    )
    const input = {
      name: '重复角色',
      code: 'admin',
      status: ROLE_STATUS_ENABLED,
      sortOrder: 0,
      resourceIds: [],
    } satisfies Parameters<typeof createRole>[0]

    await expect(createRole(input)).rejects.toMatchObject({
      status: 409,
      field: 'code',
      message: '编码已存在',
    })
    expectFetchCall(fetchMock, 0, {
      method: 'POST',
      pathname: '/api/system/roles',
    })
    expectJsonBody(fetchMock, 0, input)
  })

  it('sends role create input and parses the created role', async () => {
    const fetchMock = createFetchMock(jsonResponse(roleRequestResponse))
    useAuthStore().accessToken = 'access-token'

    await expect(createRole(roleCreateInput)).resolves.toEqual(roleRequestResponse)

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'POST',
      pathname: '/api/system/roles',
    })
    expectJsonBody(fetchMock, 0, roleCreateInput)
  })

  it('sends role update input and parses the updated role', async () => {
    const fetchMock = createFetchMock(jsonResponse(updatedRoleRequestResponse))
    useAuthStore().accessToken = 'access-token'

    await expect(updateRole(roleRequestId, roleUpdateInput)).resolves.toEqual(
      updatedRoleRequestResponse,
    )

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'PATCH',
      pathname: `/api/system/roles/${roleRequestId}`,
    })
    expectJsonBody(fetchMock, 0, roleUpdateInput)
  })

  it('parses a role detail response', async () => {
    const fetchMock = createFetchMock(jsonResponse(updatedRoleRequestResponse))
    useAuthStore().accessToken = 'access-token'

    await expect(getRole(roleRequestId)).resolves.toEqual(updatedRoleRequestResponse)

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: `/api/system/roles/${roleRequestId}`,
    })
  })

  it('deletes a role with an empty response', async () => {
    const fetchMock = createFetchMock(emptyResponse())
    useAuthStore().accessToken = 'access-token'

    await expect(deleteRole(roleRequestId)).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'DELETE',
      pathname: `/api/system/roles/${roleRequestId}`,
    })
  })

  it('parses dictionary list responses and query params', async () => {
    const fetchMock = createFetchMock(jsonResponse(dictionaryListResponse))
    useAuthStore().accessToken = 'access-token'

    const listResult = await listDictionaries({
      page: 1,
      pageSize: 20,
      keyword: '状态',
      status: DICTIONARY_STATUS_ENABLED,
    })

    expect(listResult.total).toBe(1)
    expect(listResult.list[0]?.code).toBe('user_status')
    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/system/dictionaries',
      query: {
        page: '1',
        pageSize: '20',
        keyword: '状态',
        status: '1',
      },
    })
  })

  it('parses a dictionary detail response', async () => {
    const fetchMock = createFetchMock(jsonResponse(dictionaryDetailResponse))
    useAuthStore().accessToken = 'access-token'

    await expect(getDictionary(dictionaryId)).resolves.toEqual(dictionaryDetailResponse)

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: `/api/system/dictionaries/${dictionaryId}`,
    })
  })

  it('sends dictionary create input and parses the created dictionary', async () => {
    const fetchMock = createFetchMock(jsonResponse(dictionaryCreateResponse))
    useAuthStore().accessToken = 'access-token'

    await expect(createDictionary(dictionaryCreateInput)).resolves.toEqual(dictionaryCreateResponse)

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'POST',
      pathname: '/api/system/dictionaries',
    })
    expectJsonBody(fetchMock, 0, dictionaryCreateInput)
  })

  it('sends dictionary update input and parses the updated dictionary', async () => {
    const fetchMock = createFetchMock(jsonResponse(dictionaryUpdateResponse))
    useAuthStore().accessToken = 'access-token'

    await expect(updateDictionary(dictionaryId, dictionaryUpdateInput)).resolves.toEqual(
      dictionaryUpdateResponse,
    )

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'PUT',
      pathname: `/api/system/dictionaries/${dictionaryId}`,
    })
    expectJsonBody(fetchMock, 0, dictionaryUpdateInput)
  })

  it('deletes a dictionary with an empty response', async () => {
    const fetchMock = createFetchMock(emptyResponse())
    useAuthStore().accessToken = 'access-token'

    await expect(deleteDictionary(dictionaryId)).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'DELETE',
      pathname: `/api/system/dictionaries/${dictionaryId}`,
    })
  })

  it('parses dictionary options and encodes requested codes', async () => {
    const fetchMock = createFetchMock(jsonResponse(dictionaryOptionsResponse))
    useAuthStore().accessToken = 'access-token'

    await expect(getDictionaryOptions(['user_status', 'region'])).resolves.toEqual(
      dictionaryOptionsResponse,
    )

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/system/dictionaries/options',
      query: {
        codes: 'user_status,region',
      },
    })
  })

  it('parses create user responses and temporary passwords', async () => {
    const responseBody = {
      user: {
        id: '22222222-2222-4222-8222-222222222222',
        username: 'ada',
        nickname: 'Ada',
        avatarId: null,
        email: null,
        phone: null,
        status: USER_STATUS_ENABLED,
        builtIn: false,
        departments: [],
        roles: [],
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
      temporaryPassword: 'temp-pwd-001',
    }
    const fetchMock = createFetchMock(jsonResponse(responseBody))
    useAuthStore().accessToken = 'access-token'

    const result = await createUser(userCreateInput)

    expect(result).toEqual(responseBody)
    expect(result.temporaryPassword).toBe('temp-pwd-001')
    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'POST',
      pathname: '/api/system/users',
    })
    expectJsonBody(fetchMock, 0, userCreateInput)
  })

  it('rejects malformed create user responses with invalid temporaryPassword length', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({
        user: {
          id: '22222222-2222-4222-8222-222222222222',
          username: 'ada',
          nickname: 'Ada',
          avatarId: null,
          email: null,
          phone: null,
          status: USER_STATUS_ENABLED,
          builtIn: false,
          departments: [],
          roles: [],
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
        temporaryPassword: 'short',
      }),
    )
    useAuthStore().accessToken = 'access-token'

    await expect(createUser(userCreateInput)).rejects.toThrow()
    expectFetchCall(fetchMock, 0, {
      method: 'POST',
      pathname: '/api/system/users',
    })
    expectJsonBody(fetchMock, 0, userCreateInput)
  })

  it('rejects malformed create user responses when user is invalid', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({
        user: {
          id: 'not-a-uuid',
          username: 'ada',
          nickname: 'Ada',
          avatarId: null,
          email: null,
          phone: null,
          status: USER_STATUS_ENABLED,
          builtIn: false,
          departments: [],
          roles: [],
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
        temporaryPassword: 'temp-pwd-001',
      }),
    )
    useAuthStore().accessToken = 'access-token'

    await expect(createUser(userCreateInput)).rejects.toThrow()
    expectFetchCall(fetchMock, 0, {
      method: 'POST',
      pathname: '/api/system/users',
    })
    expectJsonBody(fetchMock, 0, userCreateInput)
  })

  it('parses reset user password responses and returns temporary passwords', async () => {
    const responseBody = {
      userId: '33333333-3333-4333-8333-333333333333',
      temporaryPassword: 'temp-reset-001',
    }
    const fetchMock = createFetchMock(jsonResponse(responseBody))
    useAuthStore().accessToken = 'access-token'

    const result = await resetUserPassword('33333333-3333-4333-8333-333333333333')

    expect(result.temporaryPassword).toBe('temp-reset-001')
    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'POST',
      pathname: '/api/system/users/33333333-3333-4333-8333-333333333333/password/reset',
    })
  })

  it('rejects malformed reset user password responses with non-uuid userId', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({
        userId: 'not-a-uuid',
        temporaryPassword: 'temp-reset-001',
      }),
    )
    useAuthStore().accessToken = 'access-token'

    await expect(resetUserPassword('not-a-uuid')).rejects.toThrow()
    expectFetchCall(fetchMock, 0, {
      method: 'POST',
      pathname: '/api/system/users/not-a-uuid/password/reset',
    })
  })

  it('rejects malformed reset user password responses with invalid temporaryPassword', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({
        userId: '33333333-3333-4333-8333-333333333333',
        temporaryPassword: 'short',
      }),
    )
    useAuthStore().accessToken = 'access-token'

    await expect(resetUserPassword('33333333-3333-4333-8333-333333333333')).rejects.toThrow()
    expectFetchCall(fetchMock, 0, {
      method: 'POST',
      pathname: '/api/system/users/33333333-3333-4333-8333-333333333333/password/reset',
    })
  })

  it('parses a user detail response', async () => {
    const fetchMock = createFetchMock(jsonResponse(userRequestResponse))
    useAuthStore().accessToken = 'access-token'

    await expect(getUser(userRequestId)).resolves.toEqual(userRequestResponse)

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: `/api/system/users/${userRequestId}`,
    })
  })

  it('sends user update input and parses the updated user', async () => {
    const fetchMock = createFetchMock(jsonResponse(updatedUserRequestResponse))
    useAuthStore().accessToken = 'access-token'

    await expect(updateUser(userRequestId, userUpdateInput)).resolves.toEqual(
      updatedUserRequestResponse,
    )

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'PATCH',
      pathname: `/api/system/users/${userRequestId}`,
    })
    expectJsonBody(fetchMock, 0, userUpdateInput)
  })

  it('deletes a user with an empty response', async () => {
    const fetchMock = createFetchMock(emptyResponse())
    useAuthStore().accessToken = 'access-token'

    await expect(deleteUser(userRequestId)).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'DELETE',
      pathname: `/api/system/users/${userRequestId}`,
    })
  })
})
