import type { Context, Next } from 'hono'
import type { hc } from 'hono/client'
import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { USER_STATUS_ENABLED, type User } from '@rev30/contracts'
import type { AppType } from '../../../../src/app'
import type { createUserService } from '../../../../src/modules/system/users/service'
import type { requireAccess } from '../../../../src/middleware/access'
import { createUserRoutes } from '../../../../src/modules/system/users/routes'
import {
  UserConflictError,
  UserMutationForbiddenError,
} from '../../../../src/modules/system/users/errors'
import type { OperationLogEvent } from '../../../../src/runtime/operation-log'
import { createOperationLogRouteTestApp } from '../../../helpers/operation-log'

type UserService = ReturnType<typeof createUserService>
type UserIdClient = ReturnType<typeof hc<AppType>>['api']['system']['users'][':id']
type UserIdRequest = { param: { id: string } }

const userId = '11111111-1111-4111-8111-111111111111'
const departmentId = '22222222-2222-4222-8222-222222222222'
const roleId = '33333333-3333-4333-8333-333333333333'
const userAccess = {
  accessCodes: ['system:user:create', 'system:user:update'],
  isAdmin: false,
}
const user = {
  id: userId,
  username: 'ada',
  nickname: 'Ada Lovelace',
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

const mocks = vi.hoisted(() => {
  const accessMiddleware = vi.fn(async (_c: Context, next: Next) => next())
  const service = {
    create: vi.fn<UserService['create']>(),
    delete: vi.fn<UserService['delete']>(),
    get: vi.fn<UserService['get']>(),
    list: vi.fn<UserService['list']>(),
    options: vi.fn<UserService['options']>(),
    resetPassword: vi.fn<UserService['resetPassword']>(),
    update: vi.fn<UserService['update']>(),
  }

  return {
    accessMiddleware,
    createUserService: vi.fn(() => service),
    requireAccess: vi.fn<typeof requireAccess>(() => accessMiddleware),
    service,
  }
})

vi.mock('../../../../src/middleware/access', () => ({
  requireAccess: mocks.requireAccess,
}))

vi.mock('../../../../src/modules/system/users/service', () => ({
  createUserService: mocks.createUserService,
}))

function createTestApp(events: OperationLogEvent[] = []) {
  return createOperationLogRouteTestApp(events, { ...userAccess, currentUser: user }).route(
    '/api/system/users',
    createUserRoutes({} as never),
  )
}

describe('user routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.values(mocks.service).forEach((mock) => mock.mockReset())
    mocks.requireAccess.mockReturnValue(mocks.accessMiddleware)
    mocks.createUserService.mockReturnValue(mocks.service)
    mocks.service.list.mockResolvedValue({ list: [user], total: 1, page: 2, pageSize: 5 })
    mocks.service.options.mockResolvedValue([
      {
        id: userId,
        username: 'ada',
        nickname: 'Ada Lovelace',
        status: USER_STATUS_ENABLED,
      },
    ])
    mocks.service.create.mockResolvedValue({ user, temporaryPassword: 'temporary-password' })
    mocks.service.get.mockResolvedValue(user)
    mocks.service.update.mockResolvedValue({ ...user, nickname: 'Updated Ada' })
    mocks.service.resetPassword.mockResolvedValue({ userId, temporaryPassword: 'reset-password' })
    mocks.service.delete.mockResolvedValue(undefined)
  })

  it('requires the user id for detail, deletion and password reset RPC calls', () => {
    expectTypeOf<Parameters<UserIdClient['$get']>[0]>().toEqualTypeOf<UserIdRequest>()
    expectTypeOf<Parameters<UserIdClient['$delete']>[0]>().toEqualTypeOf<UserIdRequest>()
    expectTypeOf<
      Parameters<UserIdClient['password']['reset']['$post']>[0]
    >().toEqualTypeOf<UserIdRequest>()
  })

  it.each([
    ['', 'GET', 'system:user:list', 'list', null, 200],
    ['/options', 'GET', 'system:user:list', 'options', null, 200],
    [`/${userId}`, 'GET', 'system:user:list', 'get', null, 200],
    ['', 'POST', 'system:user:create', 'create', { username: 'ada', nickname: 'Ada' }, 201],
    [`/${userId}`, 'PATCH', 'system:user:update', 'update', { nickname: 'Updated Ada' }, 200],
    [`/${userId}`, 'DELETE', 'system:user:delete', 'delete', null, 204],
    [`/${userId}/password/reset`, 'POST', 'system:user:reset-password', 'resetPassword', null, 200],
  ] as const)(
    'executes the required access guard for %s %s',
    async (path, method, code, service, body, status) => {
      mocks.requireAccess.mockImplementation((requiredAccess) => async (c, next) => {
        if (c.req.header('x-test-access') !== requiredAccess) {
          return c.json({ requiredAccess }, 403)
        }
        await next()
      })
      const events: OperationLogEvent[] = []
      const app = createTestApp(events)
      const request = {
        method,
        ...(body === null
          ? {}
          : {
              body: JSON.stringify(body),
              headers: { 'content-type': 'application/json' },
            }),
      }

      const denied = await app.request(`/api/system/users${path}`, request)
      expect(denied.status).toBe(403)
      expect(await denied.json()).toEqual({ requiredAccess: code })
      for (const serviceMock of Object.values(mocks.service)) {
        expect(serviceMock).not.toHaveBeenCalled()
      }
      expect(events).toEqual([])

      const allowed = await app.request(`/api/system/users${path}`, {
        ...request,
        headers: { ...request.headers, 'x-test-access': code },
      })
      expect(allowed.status).toBe(status)
      expect(mocks.service[service]).toHaveBeenCalledOnce()
    },
  )

  it('parses list query and delegates to the user service', async () => {
    const app = createTestApp()

    const listResponse = await app.request(
      `/api/system/users?page=2&pageSize=5&keyword=ada&status=1&departmentId=${departmentId}&roleId=${roleId}`,
    )
    expect(listResponse.status).toBe(200)
    expect(await listResponse.json()).toEqual({ list: [user], total: 1, page: 2, pageSize: 5 })
    expect(mocks.service.list).toHaveBeenCalledWith({
      keyword: 'ada',
      page: 2,
      pageSize: 5,
      status: USER_STATUS_ENABLED,
      departmentId,
      roleId,
    })
  })

  it('delegates option requests to the user service', async () => {
    const app = createTestApp()

    const response = await app.request(
      `/api/system/users/options?includeIds=${userId},22222222-2222-4222-8222-222222222222`,
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([
      {
        id: userId,
        username: 'ada',
        nickname: 'Ada Lovelace',
        status: USER_STATUS_ENABLED,
      },
    ])
    expect(mocks.service.options).toHaveBeenCalledWith({
      includeIds: [userId, '22222222-2222-4222-8222-222222222222'],
    })
    expect(mocks.service.get).not.toHaveBeenCalled()
  })

  it('delegates create requests to the user service', async () => {
    const events: OperationLogEvent[] = []
    const app = createTestApp(events)
    const avatarId = '44444444-4444-4444-8444-444444444444'

    const createBody = {
      username: 'ada',
      nickname: 'Ada Lovelace',
      avatarId,
      email: null,
      phone: null,
      departmentIds: [],
      roleIds: [],
    }
    const createResponse = await app.request('/api/system/users', {
      method: 'POST',
      body: JSON.stringify(createBody),
      headers: { 'content-type': 'application/json' },
    })

    expect(createResponse.status).toBe(201)
    expect(await createResponse.json()).toEqual({
      user,
      temporaryPassword: 'temporary-password',
    })
    expect(mocks.service.create).toHaveBeenCalledWith(
      {
        ...createBody,
        status: USER_STATUS_ENABLED,
      },
      userAccess,
    )
    expect(events).toEqual([
      expect.objectContaining({
        action: 'system:user:create',
        targetKey: 'ada',
        targetLabel: 'Ada Lovelace',
        httpStatus: 201,
      }),
    ])
    expect(JSON.stringify(events)).not.toMatch(
      /avatar|email|phone|department|role|temporary-password/,
    )
  })

  it.each([
    [{ nickname: 'Updated Ada', avatarId: null }, 'Updated Ada'],
    [{ avatarId: null }, null],
  ] as const)('delegates updates by id and audits the target for %j', async (body, targetLabel) => {
    const events: OperationLogEvent[] = []
    const app = createTestApp(events)

    const updateResponse = await app.request(`/api/system/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    })
    expect(updateResponse.status).toBe(200)
    expect(mocks.service.update).toHaveBeenCalledWith(userId, body, userAccess)
    expect(events).toEqual([
      expect.objectContaining({
        action: 'system:user:update',
        targetKey: userId,
        targetLabel,
        httpStatus: 200,
      }),
    ])
    expect(JSON.stringify(events)).not.toContain('avatarId')
  })

  it('delegates reset-password requests by id', async () => {
    const events: OperationLogEvent[] = []
    const app = createTestApp(events)

    const resetResponse = await app.request(`/api/system/users/${userId}/password/reset`, {
      method: 'POST',
    })
    expect(resetResponse.status).toBe(200)
    expect(mocks.service.resetPassword).toHaveBeenCalledWith(userId, userAccess)
    expect(events).toEqual([
      expect.objectContaining({
        action: 'system:user:reset-password',
        targetKey: userId,
        targetLabel: null,
        httpStatus: 200,
      }),
    ])
  })

  it('delegates delete requests by id', async () => {
    const events: OperationLogEvent[] = []
    const app = createTestApp(events)

    const deleteResponse = await app.request(`/api/system/users/${userId}`, {
      method: 'DELETE',
    })
    expect(deleteResponse.status).toBe(204)
    expect(mocks.service.delete).toHaveBeenCalledWith(userId, userAccess)
    expect(events).toEqual([
      expect.objectContaining({
        action: 'system:user:delete',
        targetKey: userId,
        targetLabel: null,
        httpStatus: 204,
      }),
    ])
  })

  it('returns query validation errors before calling the user service', async () => {
    const app = createTestApp()

    const listResponse = await app.request('/api/system/users?page=0')
    expect(listResponse.status).toBe(400)
    expect(await listResponse.json()).toEqual({ message: '查询参数无效' })
    expect(mocks.service.list).not.toHaveBeenCalled()
  })

  it('returns option query validation errors before calling the user service', async () => {
    const app = createTestApp()

    const response = await app.request('/api/system/users/options?includeIds=not-a-uuid')

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ message: '查询参数无效' })
    expect(mocks.service.options).not.toHaveBeenCalled()
  })

  it('returns id validation errors before calling user service methods', async () => {
    const app = createTestApp()

    const detailResponse = await app.request('/api/system/users/not-a-uuid')
    expect(detailResponse.status).toBe(400)
    expect(await detailResponse.json()).toEqual({ message: '用户 ID 无效' })
    expect(mocks.service.get).not.toHaveBeenCalled()

    const resetResponse = await app.request('/api/system/users/not-a-uuid/password/reset', {
      method: 'POST',
    })
    expect(resetResponse.status).toBe(400)
    expect(await resetResponse.json()).toEqual({ message: '用户 ID 无效' })
    expect(mocks.service.resetPassword).not.toHaveBeenCalled()

    const updateResponse = await app.request('/api/system/users/not-a-uuid', {
      method: 'PATCH',
      body: JSON.stringify({ nickname: 'Invalid ID' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(updateResponse.status).toBe(400)
    expect(await updateResponse.json()).toEqual({ message: '用户 ID 无效' })
    expect(mocks.service.update).not.toHaveBeenCalled()

    const deleteResponse = await app.request('/api/system/users/not-a-uuid', {
      method: 'DELETE',
    })
    expect(deleteResponse.status).toBe(400)
    expect(await deleteResponse.json()).toEqual({ message: '用户 ID 无效' })
    expect(mocks.service.delete).not.toHaveBeenCalled()
  })

  it('returns create body validation errors before calling the user service', async () => {
    const events: OperationLogEvent[] = []
    const app = createTestApp(events)

    const createResponse = await app.request('/api/system/users', {
      method: 'POST',
      body: JSON.stringify({ username: 'ada' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(createResponse.status).toBe(400)
    expect(await createResponse.json()).toEqual({ message: '请求体无效' })
    expect(mocks.service.create).not.toHaveBeenCalled()
    expect(events).toEqual([])
  })

  it('returns update body validation errors before calling the user service', async () => {
    const events: OperationLogEvent[] = []
    const app = createTestApp(events)

    const updateResponse = await app.request(`/api/system/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    })
    expect(updateResponse.status).toBe(400)
    expect(await updateResponse.json()).toEqual({ message: '请求体无效' })
    expect(mocks.service.update).not.toHaveBeenCalled()
    expect(events).toEqual([])
  })

  it('maps user conflict errors to route responses', async () => {
    const app = createTestApp()

    mocks.service.create.mockRejectedValueOnce(new UserConflictError('username'))
    const conflictResponse = await app.request('/api/system/users', {
      method: 'POST',
      body: JSON.stringify({
        username: 'ada',
        nickname: 'Ada Lovelace',
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(conflictResponse.status).toBe(409)
    expect(await conflictResponse.json()).toEqual({
      field: 'username',
      message: '用户名已存在',
    })
  })

  it('maps forbidden user mutations to route responses', async () => {
    const events: OperationLogEvent[] = []
    const app = createTestApp(events)

    mocks.service.update.mockRejectedValueOnce(new UserMutationForbiddenError('user-access'))
    const response = await app.request(`/api/system/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ nickname: 'Blocked Update' }),
      headers: { 'content-type': 'application/json' },
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ message: '不能操作超出自身权限范围的用户' })
    expect(events).toEqual([
      expect.objectContaining({
        action: 'system:user:update',
        targetKey: userId,
        targetLabel: 'Blocked Update',
        result: 'failure',
        httpStatus: 403,
      }),
    ])
  })

  it('uses the root error response for unexpected failures after registering user details', async () => {
    const events: OperationLogEvent[] = []
    const app = createTestApp(events)
    mocks.service.get.mockRejectedValueOnce(new Error('unexpected-user-service-failure'))

    const response = await app.request(`/api/system/users/${userId}`)

    expect(response.status).toBe(500)
    expect(await response.text()).toBe('Internal Server Error')
    expect(events).toEqual([
      expect.objectContaining({
        action: 'system:user:view',
        targetKey: userId,
        targetLabel: null,
        result: 'failure',
        httpStatus: 500,
      }),
    ])
  })
})
