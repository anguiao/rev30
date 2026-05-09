// @vitest-environment happy-dom

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEPARTMENT_STATUS_ENABLED,
  RESOURCE_OPEN_TARGET_SELF,
  RESOURCE_STATUS_ENABLED,
  RESOURCE_TYPE_DIRECTORY,
  RESOURCE_TYPE_MENU,
  ROLE_STATUS_ENABLED,
  USER_STATUS_ENABLED,
} from '@rev30/shared'
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
  createUser,
  resetUserPassword,
  SystemRequestError,
  getUser,
  getDepartmentTree,
  updateDepartment,
  getResourceTree,
  getSystemErrorMessage,
  listRoles,
  listUsers,
  updateResource,
  updateRole,
  updateUser,
} from '../../../src/features/system'
import { useAuthStore } from '../../../src/stores/auth'

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('system request helpers', () => {
  it('parses list responses from the system users endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          list: [],
          total: 0,
          page: 1,
          pageSize: 20,
        }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    useAuthStore().accessToken = 'access-token'

    const result = await listUsers({
      page: 1,
      pageSize: 20,
      keyword: 'ada',
      status: USER_STATUS_ENABLED,
    })

    expect(result.total).toBe(0)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/system/users')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('keyword=ada')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('status=1')
  })

  it('omits empty query values before sending requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          list: [],
          total: 0,
          page: 1,
          pageSize: 20,
        }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    useAuthStore().accessToken = 'access-token'

    await listUsers({
      page: 1,
      pageSize: 20,
      keyword: '',
      status: USER_STATUS_ENABLED,
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain('keyword=')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('status=1')
  })

  it('parses list responses from the system roles endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
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
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
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
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/system/roles')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('keyword=admin')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('status=1')
  })

  it('parses department tree responses from the system departments endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
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
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    useAuthStore().accessToken = 'access-token'

    const result = await getDepartmentTree()

    expect(result[0]?.children[0]?.code).toBe('eng')
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/system/departments/tree')
  })

  it('sends department detail, create, update, and delete requests', async () => {
    const departmentResponse = {
      id: '22222222-2222-4222-8222-222222222222',
      parentId: null,
      name: '总部',
      code: 'hq',
      status: DEPARTMENT_STATUS_ENABLED,
      sortOrder: 1,
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
    }
    const updatedDepartmentResponse = {
      ...departmentResponse,
      name: '研发中心',
      code: 'eng',
      sortOrder: 2,
      updatedAt: '2026-05-02T00:00:00.000Z',
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(departmentResponse)))
      .mockResolvedValueOnce(new Response(JSON.stringify(departmentResponse), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(updatedDepartmentResponse)))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    useAuthStore().accessToken = 'access-token'

    const department = await getDepartment('22222222-2222-4222-8222-222222222222')
    const created = await createDepartment({
      name: '总部',
      code: 'hq',
      parentId: null,
      status: DEPARTMENT_STATUS_ENABLED,
      sortOrder: 1,
    })
    const updated = await updateDepartment('22222222-2222-4222-8222-222222222222', {
      name: '研发中心',
      code: 'eng',
      parentId: null,
      status: DEPARTMENT_STATUS_ENABLED,
      sortOrder: 2,
    })
    await deleteDepartment('22222222-2222-4222-8222-222222222222')

    expect(department.code).toBe('hq')
    expect(created.name).toBe('总部')
    expect(updated.code).toBe('eng')
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/api/system/departments/22222222-2222-4222-8222-222222222222',
    )
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/system/departments',
      expect.objectContaining({
        method: 'POST',
      }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/system/departments/22222222-2222-4222-8222-222222222222',
      expect.objectContaining({
        method: 'PATCH',
      }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/system/departments/22222222-2222-4222-8222-222222222222',
      expect.objectContaining({
        method: 'DELETE',
      }),
    )
  })

  it('parses resource tree responses from the system resources endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: '44444444-4444-4444-8444-444444444444',
            parentId: null,
            type: RESOURCE_TYPE_MENU,
            name: '用户管理',
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
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    useAuthStore().accessToken = 'access-token'

    const result = await getResourceTree()

    expect(result[0]?.path).toBe('/system/users')
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/system/resources/tree')
  })

  it('sends resource detail, create, update, and delete requests', async () => {
    const resourceResponse = {
      id: '44444444-4444-4444-8444-444444444444',
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
    const updatedResourceResponse = {
      ...resourceResponse,
      name: '资源管理',
      code: 'system:resource',
      updatedAt: '2026-05-02T00:00:00.000Z',
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(resourceResponse)))
      .mockResolvedValueOnce(new Response(JSON.stringify(resourceResponse), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(updatedResourceResponse)))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    useAuthStore().accessToken = 'access-token'

    const resource = await getResource('44444444-4444-4444-8444-444444444444')
    const created = await createResource({
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
    })
    const updated = await updateResource('44444444-4444-4444-8444-444444444444', {
      name: '资源管理',
      code: 'system:resource',
    })
    await deleteResource('44444444-4444-4444-8444-444444444444')

    expect(resource.icon).toBe('lucide:settings')
    expect(created.name).toBe('系统管理')
    expect(updated.code).toBe('system:resource')
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/api/system/resources/44444444-4444-4444-8444-444444444444',
    )
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/system/resources',
      expect.objectContaining({
        method: 'POST',
      }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/system/resources/44444444-4444-4444-8444-444444444444',
      expect.objectContaining({
        method: 'PATCH',
      }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/system/resources/44444444-4444-4444-8444-444444444444',
      expect.objectContaining({
        method: 'DELETE',
      }),
    )
  })

  it('throws a stable request error with the response message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: '查询失败' }), {
        status: 500,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(listUsers({ page: 1, pageSize: 20 })).rejects.toMatchObject({
      status: 500,
      message: '查询失败',
    })
  })

  it('formats unknown request errors with a fallback message', () => {
    expect(getSystemErrorMessage(new SystemRequestError(400, '请求体无效'), '加载用户失败')).toBe(
      '请求体无效',
    )
    expect(getSystemErrorMessage(new Error('boom'), '加载用户失败')).toBe('加载用户失败')
  })

  it('parses system errors with field names', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ field: 'code', message: '角色编码已存在' }), {
        status: 409,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      createRole({
        name: '重复角色',
        code: 'admin',
        status: ROLE_STATUS_ENABLED,
        sortOrder: 0,
        resourceIds: [],
      }),
    ).rejects.toMatchObject({
      status: 409,
      field: 'code',
      message: '角色编码已存在',
    })
  })

  it('parses department code conflict field errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ field: 'code', message: '部门编码已存在' }), {
        status: 409,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const promise = createDepartment({
      name: '重复部门',
      code: 'hq',
      parentId: null,
      status: DEPARTMENT_STATUS_ENABLED,
      sortOrder: 0,
    })

    await expect(promise).rejects.toBeInstanceOf(SystemRequestError)
    await expect(promise).rejects.toMatchObject({
      status: 409,
      field: 'code',
      message: '部门编码已存在',
    })
  })

  it('sends role create, update, detail, and delete requests', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: '11111111-1111-4111-8111-111111111111',
            name: '运营',
            code: 'operator',
            status: ROLE_STATUS_ENABLED,
            sortOrder: 1,
            resources: [],
            createdAt: '2026-05-01T00:00:00.000Z',
            updatedAt: '2026-05-01T00:00:00.000Z',
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: '11111111-1111-4111-8111-111111111111',
            name: '运营主管',
            code: 'operator',
            status: ROLE_STATUS_ENABLED,
            sortOrder: 2,
            resources: [],
            createdAt: '2026-05-01T00:00:00.000Z',
            updatedAt: '2026-05-02T00:00:00.000Z',
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: '11111111-1111-4111-8111-111111111111',
            name: '运营主管',
            code: 'operator',
            status: ROLE_STATUS_ENABLED,
            sortOrder: 2,
            resources: [],
            createdAt: '2026-05-01T00:00:00.000Z',
            updatedAt: '2026-05-02T00:00:00.000Z',
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    useAuthStore().accessToken = 'access-token'

    await createRole({
      name: '运营',
      code: 'operator',
      status: ROLE_STATUS_ENABLED,
      sortOrder: 1,
      resourceIds: [],
    })
    await updateRole('11111111-1111-4111-8111-111111111111', {
      name: '运营主管',
      code: 'operator',
      status: ROLE_STATUS_ENABLED,
      sortOrder: 2,
      resourceIds: [],
    })
    const role = await getRole('11111111-1111-4111-8111-111111111111')
    await deleteRole('11111111-1111-4111-8111-111111111111')

    expect(role.name).toBe('运营主管')
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/system/roles')
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      '/api/system/roles/11111111-1111-4111-8111-111111111111',
    )
  })

  it('parses create user responses and temporary passwords', async () => {
    const responseBody = {
      user: {
        id: '22222222-2222-4222-8222-222222222222',
        username: 'ada',
        nickname: 'Ada',
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
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(responseBody)))
    vi.stubGlobal('fetch', fetchMock)
    useAuthStore().accessToken = 'access-token'

    const result = await createUser({
      username: 'ada',
      nickname: 'Ada',
      email: null,
      phone: null,
      status: USER_STATUS_ENABLED,
      departmentIds: [],
      roleIds: [],
    })

    expect(result).toEqual(responseBody)
    expect(result.temporaryPassword).toBe('temp-pwd-001')
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/system/users')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/system/users',
      expect.objectContaining({
        method: 'POST',
      }),
    )
  })

  it('rejects malformed create user responses with invalid temporaryPassword length', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          user: {
            id: '22222222-2222-4222-8222-222222222222',
            username: 'ada',
            nickname: 'Ada',
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
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    useAuthStore().accessToken = 'access-token'

    await expect(
      createUser({
        username: 'ada',
        nickname: 'Ada',
        email: null,
        phone: null,
        status: USER_STATUS_ENABLED,
        departmentIds: [],
        roleIds: [],
      }),
    ).rejects.toThrow()
  })

  it('rejects malformed create user responses when user is invalid', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          user: {
            id: 'not-a-uuid',
            username: 'ada',
            nickname: 'Ada',
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
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    useAuthStore().accessToken = 'access-token'

    await expect(
      createUser({
        username: 'ada',
        nickname: 'Ada',
        email: null,
        phone: null,
        status: USER_STATUS_ENABLED,
        departmentIds: [],
        roleIds: [],
      }),
    ).rejects.toThrow()
  })

  it('parses reset user password responses and returns temporary passwords', async () => {
    const responseBody = {
      userId: '33333333-3333-4333-8333-333333333333',
      temporaryPassword: 'temp-reset-001',
    }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(responseBody)))
    vi.stubGlobal('fetch', fetchMock)
    useAuthStore().accessToken = 'access-token'

    const result = await resetUserPassword('33333333-3333-4333-8333-333333333333')

    expect(result.temporaryPassword).toBe('temp-reset-001')
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/api/system/users/33333333-3333-4333-8333-333333333333/password/reset',
    )
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        '/api/system/users/33333333-3333-4333-8333-333333333333/password/reset',
      ),
      expect.objectContaining({
        method: 'POST',
      }),
    )
  })

  it('rejects malformed reset user password responses with non-uuid userId', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          userId: 'not-a-uuid',
          temporaryPassword: 'temp-reset-001',
        }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    useAuthStore().accessToken = 'access-token'

    await expect(resetUserPassword('not-a-uuid')).rejects.toThrow()
  })

  it('rejects malformed reset user password responses with invalid temporaryPassword', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          userId: '33333333-3333-4333-8333-333333333333',
          temporaryPassword: 'short',
        }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    useAuthStore().accessToken = 'access-token'

    await expect(resetUserPassword('33333333-3333-4333-8333-333333333333')).rejects.toThrow()
  })

  it('sends user detail, update, and delete requests', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: '22222222-2222-4222-8222-222222222222',
            username: 'ada',
            nickname: 'Ada',
            email: null,
            phone: null,
            status: USER_STATUS_ENABLED,
            builtIn: false,
            departments: [],
            roles: [],
            createdAt: '2026-05-01T00:00:00.000Z',
            updatedAt: '2026-05-01T00:00:00.000Z',
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: '22222222-2222-4222-8222-222222222222',
            username: 'ada',
            nickname: 'Ada Lovelace',
            email: 'ada@example.com',
            phone: null,
            status: USER_STATUS_ENABLED,
            builtIn: false,
            departments: [],
            roles: [],
            createdAt: '2026-05-01T00:00:00.000Z',
            updatedAt: '2026-05-02T00:00:00.000Z',
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    useAuthStore().accessToken = 'access-token'

    const user = await getUser('22222222-2222-4222-8222-222222222222')
    const updated = await updateUser('22222222-2222-4222-8222-222222222222', {
      username: 'ada',
      nickname: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: null,
      status: USER_STATUS_ENABLED,
      departmentIds: [],
      roleIds: [],
    })
    await deleteUser('22222222-2222-4222-8222-222222222222')

    expect(user.username).toBe('ada')
    expect(updated.nickname).toBe('Ada Lovelace')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
