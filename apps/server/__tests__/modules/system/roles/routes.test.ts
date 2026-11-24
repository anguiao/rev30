import type { Context, Next } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RESOURCE_TYPE_ACTION,
  ROLE_STATUS_ENABLED,
  USER_STATUS_ENABLED,
  type User,
  type Role,
} from '@rev30/contracts'
import type { createRoleService } from '../../../../src/modules/system/roles/service'
import type { requireAccess } from '../../../../src/middleware/access'
import { RoleConflictError } from '../../../../src/modules/system/roles/errors'
import { createRoleRoutes } from '../../../../src/modules/system/roles/routes'
import type { OperationLogEvent } from '../../../../src/runtime/operation-log'
import { createOperationLogRouteTestApp } from '../../../helpers/operation-log'

type RoleService = ReturnType<typeof createRoleService>

const roleId = '33333333-3333-4333-8333-333333333333'
const resourceId = '44444444-4444-4444-8444-444444444444'
const actorId = '55555555-5555-4555-8555-555555555555'
const userAccess = {
  accessCodes: ['system:role:create', 'system:role:update'],
  isAdmin: false,
}
const actor = {
  id: actorId,
  username: 'role-manager',
  nickname: 'Role Manager',
  avatarId: null,
  email: null,
  phone: null,
  status: USER_STATUS_ENABLED,
  builtIn: false,
  departments: [],
  roles: [],
  createdAt: '2026-05-06T00:00:00.000Z',
  updatedAt: '2026-05-06T00:00:00.000Z',
} satisfies User
const role = {
  id: roleId,
  name: 'Administrator',
  code: 'test-admin',
  status: ROLE_STATUS_ENABLED,
  sortOrder: 10,
  createdAt: '2026-05-06T00:00:00.000Z',
  updatedAt: '2026-05-06T00:00:00.000Z',
  resources: [
    {
      id: resourceId,
      name: 'Create User',
      code: 'system:user:create',
      type: RESOURCE_TYPE_ACTION,
    },
  ],
} satisfies Role

const mocks = vi.hoisted(() => {
  const accessMiddleware = vi.fn(async (_c: Context, next: Next) => next())
  const service = {
    create: vi.fn<RoleService['create']>(),
    delete: vi.fn<RoleService['delete']>(),
    get: vi.fn<RoleService['get']>(),
    list: vi.fn<RoleService['list']>(),
    options: vi.fn<RoleService['options']>(),
    update: vi.fn<RoleService['update']>(),
  }

  return {
    accessMiddleware,
    createRoleService: vi.fn(() => service),
    requireAccess: vi.fn<typeof requireAccess>(() => accessMiddleware),
    service,
  }
})

vi.mock('../../../../src/middleware/access', () => ({
  requireAccess: mocks.requireAccess,
}))

vi.mock('../../../../src/modules/system/roles/service', () => ({
  createRoleService: mocks.createRoleService,
}))

function createTestApp(events: OperationLogEvent[] = []) {
  return createOperationLogRouteTestApp(events, { ...userAccess, currentUser: actor }).route(
    '/api/system/roles',
    createRoleRoutes({} as never),
  )
}

describe('role routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.values(mocks.service).forEach((mock) => mock.mockReset())
    mocks.requireAccess.mockReturnValue(mocks.accessMiddleware)
    mocks.createRoleService.mockReturnValue(mocks.service)
    mocks.service.list.mockResolvedValue({
      list: [{ ...role, userCount: 0 }],
      total: 1,
      page: 2,
      pageSize: 5,
    })
    mocks.service.options.mockResolvedValue([
      {
        id: roleId,
        name: 'Administrator',
        code: 'test-admin',
        status: ROLE_STATUS_ENABLED,
      },
    ])
    mocks.service.get.mockResolvedValue(role)
    mocks.service.create.mockResolvedValue(role)
    mocks.service.update.mockResolvedValue({ ...role, name: 'Updated Administrator' })
    mocks.service.delete.mockResolvedValue(undefined)
  })

  it.each([
    ['', 'GET', 'system:role:list', 'list', null, 200],
    ['/options', 'GET', 'system:role:list', 'options', null, 200],
    [`/${roleId}`, 'GET', 'system:role:list', 'get', null, 200],
    ['', 'POST', 'system:role:create', 'create', { name: 'Operator', code: 'operator' }, 201],
    [`/${roleId}`, 'PATCH', 'system:role:update', 'update', { name: 'Updated Operator' }, 200],
    [`/${roleId}`, 'DELETE', 'system:role:delete', 'delete', null, 204],
  ] as const)(
    'executes the required access guard for %s %s',
    async (path, method, code, service, body, status) => {
      mocks.requireAccess.mockImplementation((requiredAccess) => async (c, next) => {
        if (c.req.header('x-test-access') !== requiredAccess) {
          return c.json({ requiredAccess }, 403)
        }
        await next()
      })
      const app = createTestApp()
      const request = {
        method,
        ...(body === null
          ? {}
          : {
              body: JSON.stringify(body),
              headers: { 'content-type': 'application/json' },
            }),
      }

      const denied = await app.request(`/api/system/roles${path}`, request)
      expect(denied.status).toBe(403)
      expect(await denied.json()).toEqual({ requiredAccess: code })
      for (const serviceMock of Object.values(mocks.service)) {
        expect(serviceMock).not.toHaveBeenCalled()
      }

      const allowed = await app.request(`/api/system/roles${path}`, {
        ...request,
        headers: { ...request.headers, 'x-test-access': code },
      })
      expect(allowed.status).toBe(status)
      expect(mocks.service[service]).toHaveBeenCalledOnce()
    },
  )

  it('parses list query and delegates to the role service', async () => {
    const app = createTestApp()

    const listResponse = await app.request(
      '/api/system/roles?page=2&pageSize=5&keyword=admin&status=1',
    )
    expect(listResponse.status).toBe(200)
    expect(mocks.service.list).toHaveBeenCalledWith({
      keyword: 'admin',
      page: 2,
      pageSize: 5,
      status: ROLE_STATUS_ENABLED,
    })
  })

  it('delegates option requests to the role service', async () => {
    const app = createTestApp()

    const response = await app.request(`/api/system/roles/options?includeIds=${roleId}`)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([
      {
        id: roleId,
        name: 'Administrator',
        code: 'test-admin',
        status: ROLE_STATUS_ENABLED,
      },
    ])
    expect(mocks.service.options).toHaveBeenCalledWith({
      includeIds: [roleId],
    })
    expect(mocks.service.get).not.toHaveBeenCalled()
  })

  it('delegates create requests to the role service', async () => {
    const app = createTestApp()

    const createResponse = await app.request('/api/system/roles', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Administrator',
        code: 'test-admin',
        resourceIds: [resourceId],
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(createResponse.status).toBe(201)
    expect(mocks.service.create).toHaveBeenCalledWith(
      {
        name: 'Administrator',
        code: 'test-admin',
        resourceIds: [resourceId],
        status: ROLE_STATUS_ENABLED,
        sortOrder: 0,
      },
      userAccess,
    )
  })

  it('delegates update requests by id', async () => {
    const app = createTestApp()

    const updateResponse = await app.request(`/api/system/roles/${roleId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Updated Administrator' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(updateResponse.status).toBe(200)
    expect(mocks.service.update).toHaveBeenCalledWith(
      roleId,
      {
        name: 'Updated Administrator',
      },
      userAccess,
    )
  })

  it('delegates delete requests by id', async () => {
    const app = createTestApp()

    const deleteResponse = await app.request(`/api/system/roles/${roleId}`, {
      method: 'DELETE',
    })
    expect(deleteResponse.status).toBe(204)
    expect(mocks.service.delete).toHaveBeenCalledWith(roleId, userAccess)
  })

  it('returns query validation errors before calling the role service', async () => {
    const events: OperationLogEvent[] = []
    const app = createTestApp(events)

    const listResponse = await app.request('/api/system/roles?page=0')
    expect(listResponse.status).toBe(400)
    expect(await listResponse.json()).toEqual({ message: '查询参数无效' })
    expect(mocks.service.list).not.toHaveBeenCalled()
    expect(events).toEqual([])
  })

  it('returns option query validation errors before calling the role service', async () => {
    const app = createTestApp()

    const response = await app.request('/api/system/roles/options?includeIds=not-a-uuid')

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ message: '查询参数无效' })
    expect(mocks.service.options).not.toHaveBeenCalled()
  })

  it('returns id validation errors before calling role service methods', async () => {
    const app = createTestApp()

    const detailResponse = await app.request('/api/system/roles/not-a-uuid')
    expect(detailResponse.status).toBe(400)
    expect(await detailResponse.json()).toEqual({ message: '角色 ID 无效' })
    expect(mocks.service.get).not.toHaveBeenCalled()
  })

  it('returns create body validation errors before calling the role service', async () => {
    const app = createTestApp()

    const createResponse = await app.request('/api/system/roles', {
      method: 'POST',
      body: JSON.stringify({ code: 'test-admin' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(createResponse.status).toBe(400)
    expect(await createResponse.json()).toEqual({ message: '请求体无效' })
    expect(mocks.service.create).not.toHaveBeenCalled()
  })

  it('maps conflict errors to route responses', async () => {
    const events: OperationLogEvent[] = []
    const app = createTestApp(events)

    mocks.service.update.mockRejectedValueOnce(new RoleConflictError())
    const conflictResponse = await app.request(`/api/system/roles/${roleId}`, {
      method: 'PATCH',
      body: JSON.stringify({ code: 'test-admin' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(conflictResponse.status).toBe(409)
    expect(await conflictResponse.json()).toEqual({
      field: 'code',
      message: '编码已存在',
    })
    expect(events).toEqual([
      expect.objectContaining({
        action: 'system:role:update',
        targetKey: roleId,
        targetLabel: null,
        httpStatus: 409,
        result: 'failure',
      }),
    ])
  })
})
