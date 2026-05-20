// @vitest-environment happy-dom

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CONFIG_STATUS_ENABLED,
  CONFIG_VALUE_TYPE_STRING,
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
  createConfig,
  deleteConfig,
  getConfig,
  listConfigs,
  updateConfig,
  createUser,
  getUser,
  getUserOptions,
  getDepartmentTree,
  getDepartmentTreeOptions,
  resetUserPassword,
  SystemRequestError,
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
  it('searches icons through the public icon endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
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
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await searchIcons({ keyword: '用户', limit: 20 })

    expect(result.list[0]?.icon).toBe('lucide:users')
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/icons/search')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('keyword=%E7%94%A8%E6%88%B7')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('limit=20')
  })

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

  it('parses list responses from the system configs endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          list: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              groupCode: 'site',
              key: 'site.title',
              name: '站点名称',
              valueType: CONFIG_VALUE_TYPE_STRING,
              value: 'Rev30',
              description: '后台显示名称',
              status: CONFIG_STATUS_ENABLED,
              createdAt: '2026-05-18T00:00:00.000Z',
              updatedAt: '2026-05-18T00:00:00.000Z',
            },
          ],
          total: 1,
          page: 1,
          pageSize: 20,
        }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    useAuthStore().accessToken = 'access-token'

    const result = await listConfigs({
      page: 1,
      pageSize: 20,
      keyword: 'title',
      groupCode: 'site',
      valueType: CONFIG_VALUE_TYPE_STRING,
      status: CONFIG_STATUS_ENABLED,
    })

    expect(result.total).toBe(1)
    expect(result.list[0]?.key).toBe('site.title')
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/system/configs')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('keyword=title')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('groupCode=site')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('valueType=string')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('status=1')
  })

  it('gets, creates, updates, and deletes configs through system config endpoints', async () => {
    const config = {
      id: '11111111-1111-4111-8111-111111111111',
      groupCode: 'site',
      key: 'site.title',
      name: '站点名称',
      valueType: CONFIG_VALUE_TYPE_STRING,
      value: 'Rev30',
      description: null,
      status: CONFIG_STATUS_ENABLED,
      sortOrder: 0,
      createdAt: '2026-05-18T00:00:00.000Z',
      updatedAt: '2026-05-18T00:00:00.000Z',
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(config)))
      .mockResolvedValueOnce(new Response(JSON.stringify(config), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...config, name: '新站点名称' })))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    useAuthStore().accessToken = 'access-token'

    await expect(getConfig(config.id)).resolves.toMatchObject({ key: 'site.title' })
    await expect(
      createConfig({
        groupCode: 'site',
        key: 'site.title',
        name: '站点名称',
        valueType: CONFIG_VALUE_TYPE_STRING,
        value: 'Rev30',
        status: CONFIG_STATUS_ENABLED,
        sortOrder: 0,
      }),
    ).resolves.toMatchObject({ key: 'site.title' })
    await expect(updateConfig(config.id, { name: '新站点名称' })).resolves.toMatchObject({
      name: '新站点名称',
    })
    await expect(deleteConfig(config.id)).resolves.toBeUndefined()

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(`/api/system/configs/${config.id}`)
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/api/system/configs')
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain(`/api/system/configs/${config.id}`)
    expect(String(fetchMock.mock.calls[3]?.[0])).toContain(`/api/system/configs/${config.id}`)
  })

  it('parses user options responses from the users options endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: '11111111-1111-4111-8111-111111111111',
            username: 'alice',
            nickname: 'Alice',
            status: USER_STATUS_ENABLED,
          },
        ]),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    useAuthStore().accessToken = 'access-token'

    const result = await getUserOptions(['11111111-1111-4111-8111-111111111111'])

    expect(result[0]?.username).toBe('alice')
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/system/users/options')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      'includeIds=11111111-1111-4111-8111-111111111111',
    )
  })

  it('omits includeIds when empty for user options requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([])))
    vi.stubGlobal('fetch', fetchMock)
    useAuthStore().accessToken = 'access-token'

    await getUserOptions([])

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain('includeIds=')
  })

  it('parses role options responses from the roles options endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: '22222222-2222-4222-8222-222222222222',
            name: '管理员',
            code: 'admin',
            status: ROLE_STATUS_ENABLED,
          },
        ]),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    useAuthStore().accessToken = 'access-token'

    const result = await getRoleOptions(['22222222-2222-4222-8222-222222222222'])

    expect(result[0]?.name).toBe('管理员')
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/system/roles/options')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      'includeIds=22222222-2222-4222-8222-222222222222',
    )
  })

  it('parses department tree options responses from the department tree options endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
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
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    useAuthStore().accessToken = 'access-token'

    const result = await getDepartmentTreeOptions(['33333333-3333-4333-8333-333333333333'])

    expect(result[0]?.children[0]?.name).toBe('研发中心')
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/system/departments/options/tree')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      'includeIds=33333333-3333-4333-8333-333333333333',
    )
  })

  it('parses resource tree options responses from the resource tree options endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
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
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    useAuthStore().accessToken = 'access-token'

    const result = await getResourceTreeOptions(['55555555-5555-4555-8555-555555555555'])

    expect(result[0]?.children[0]?.code).toBe('system.users.list')
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/system/resources/options/tree')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      'includeIds=55555555-5555-4555-8555-555555555555',
    )
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
      name: '权限资源',
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
      name: '权限资源',
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
    expect(
      getSystemErrorMessage(new SystemRequestError(400, '请求体无效'), '加载系统用户失败'),
    ).toBe('请求体无效')
    expect(getSystemErrorMessage(new Error('boom'), '加载系统用户失败')).toBe('加载系统用户失败')
  })

  it('parses system errors with field names', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ field: 'code', message: '编码已存在' }), {
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
      message: '编码已存在',
    })
  })

  it('parses department code conflict field errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ field: 'code', message: '编码已存在' }), {
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
      message: '编码已存在',
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

  it('parses list/detail/create/update/delete/options dictionary requests', async () => {
    const dictionaryId = '11111111-1111-4111-8111-111111111111'
    const listResponse = {
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
    const detailResponse = {
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
          id: '11111111-1111-4111-8111-111111111112',
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
    const createResponse = {
      ...detailResponse,
      id: '11111111-1111-4111-8111-111111111113',
      name: '地区',
      code: 'region',
    }
    const updatedResponse = {
      ...createResponse,
      name: '地区字典',
    }
    const optionsResponse = {
      user_status: [
        {
          value: 'enabled',
          label: '启用',
        },
      ],
      region: [
        {
          value: 'north',
          label: '北区',
        },
      ],
    }

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(listResponse)))
      .mockResolvedValueOnce(new Response(JSON.stringify(detailResponse)))
      .mockResolvedValueOnce(new Response(JSON.stringify(createResponse)))
      .mockResolvedValueOnce(new Response(JSON.stringify(updatedResponse)))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(optionsResponse)))
    vi.stubGlobal('fetch', fetchMock)
    useAuthStore().accessToken = 'access-token'

    const listResult = await listDictionaries({
      page: 1,
      pageSize: 20,
      keyword: '状态',
      status: DICTIONARY_STATUS_ENABLED,
    })
    const detailResult = await getDictionary(dictionaryId)
    const createInput: DictionaryCreateInput = {
      code: 'region',
      name: '地区',
      description: null,
      status: 1,
      sortOrder: 0,
      items: [],
    }
    await createDictionary(createInput)
    const updateInput: DictionaryUpdateInput = {
      code: 'user_status',
      name: '地区字典',
      description: null,
      status: 1,
      sortOrder: 1,
      items: [
        {
          id: '11111111-1111-4111-8111-111111111112',
          label: '启用',
          value: 'enabled',
          description: null,
          status: 1,
          sortOrder: 0,
        },
      ],
    }
    await updateDictionary(dictionaryId, updateInput)
    await deleteDictionary(dictionaryId)
    const optionsResult = await getDictionaryOptions(['user_status', 'region'])

    expect(listResult.total).toBe(1)
    expect(listResult.list[0]?.code).toBe('user_status')
    expect(detailResult.code).toBe('user_status')
    expect(optionsResult).toMatchObject({
      user_status: [{ value: 'enabled', label: '启用' }],
      region: [{ value: 'north', label: '北区' }],
    })
    expect(fetchMock).toHaveBeenCalledTimes(6)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/system/dictionaries')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('keyword=%E7%8A%B6%E6%80%81')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('status=1')
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      `/api/system/dictionaries/${dictionaryId}`,
    )
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/system/dictionaries',
      expect.objectContaining({
        method: 'POST',
      }),
    )
    const [, createInit] = fetchMock.mock.calls[2] as [RequestInfo | URL, RequestInit]
    expect(createInit.body).toEqual(expect.any(String))
    expect(JSON.parse(createInit.body as string)).toEqual(createInput)
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/system/dictionaries/${dictionaryId}`,
      expect.objectContaining({
        method: 'PUT',
      }),
    )
    const [, updateInit] = fetchMock.mock.calls[3] as [RequestInfo | URL, RequestInit]
    expect(updateInit.body).toEqual(expect.any(String))
    expect(JSON.parse(updateInit.body as string)).toEqual(updateInput)
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/system/dictionaries/${dictionaryId}`,
      expect.objectContaining({
        method: 'DELETE',
      }),
    )
    expect(String(fetchMock.mock.calls[5]?.[0])).toContain('/api/system/dictionaries/options')
    const optionsUrl = new URL(String(fetchMock.mock.calls[5]?.[0]), 'http://localhost')
    expect(optionsUrl.searchParams.get('codes')).toBe('user_status,region')
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
