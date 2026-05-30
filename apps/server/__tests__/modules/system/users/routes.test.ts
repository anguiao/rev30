import type { Context, Next } from 'hono'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { USER_STATUS_ENABLED } from '@rev30/contracts'
import { createUserRoutes } from '../../../../src/modules/system/users/routes'
import {
  BuiltInUserMutationError,
  UserConflictError,
  UserInvalidDepartmentError,
  UserInvalidRoleError,
  UserNotFoundError,
} from '../../../../src/modules/system/users/errors'

const userId = '11111111-1111-4111-8111-111111111111'
const departmentId = '22222222-2222-4222-8222-222222222222'
const roleId = '33333333-3333-4333-8333-333333333333'
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
}

const mocks = vi.hoisted(() => {
  const accessMiddleware = vi.fn(async (_c: Context, next: Next) => next())
  const service = {
    create: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
    list: vi.fn(),
    options: vi.fn(),
    resetPassword: vi.fn(),
    update: vi.fn(),
  }

  return {
    accessMiddleware,
    createUserService: vi.fn(() => service),
    requireAccess: vi.fn(() => accessMiddleware),
    service,
  }
})

vi.mock('../../../../src/middleware/access', () => ({
  requireAccess: mocks.requireAccess,
}))

vi.mock('../../../../src/modules/system/users/service', () => ({
  createUserService: mocks.createUserService,
}))

function createTestApp() {
  return new Hono().route('/api/system/users', createUserRoutes({} as never))
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

  it('registers expected access guards for every user endpoint', () => {
    createTestApp()

    expect((mocks.requireAccess.mock.calls as unknown as [string][]).map(([code]) => code)).toEqual(
      [
        'system:user:list',
        'system:user:list',
        'system:user:create',
        'system:user:reset-password',
        'system:user:list',
        'system:user:update',
        'system:user:delete',
      ],
    )
  })

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
    const app = createTestApp()

    const createBody = {
      username: 'ada',
      nickname: 'Ada Lovelace',
      avatarId: null,
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
    expect(mocks.service.create).toHaveBeenCalledWith({
      ...createBody,
      status: USER_STATUS_ENABLED,
    })
  })

  it('delegates detail requests by id', async () => {
    const app = createTestApp()

    const detailResponse = await app.request(`/api/system/users/${userId}`)
    expect(detailResponse.status).toBe(200)
    expect(mocks.service.get).toHaveBeenCalledWith(userId)
  })

  it('delegates update requests by id', async () => {
    const app = createTestApp()

    const updateResponse = await app.request(`/api/system/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ nickname: 'Updated Ada' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(updateResponse.status).toBe(200)
    expect(mocks.service.update).toHaveBeenCalledWith(userId, { nickname: 'Updated Ada' })
  })

  it('delegates reset-password requests by id', async () => {
    const app = createTestApp()

    const resetResponse = await app.request(`/api/system/users/${userId}/password/reset`, {
      method: 'POST',
    })
    expect(resetResponse.status).toBe(200)
    expect(mocks.service.resetPassword).toHaveBeenCalledWith(userId)
  })

  it('delegates delete requests by id', async () => {
    const app = createTestApp()

    const deleteResponse = await app.request(`/api/system/users/${userId}`, {
      method: 'DELETE',
    })
    expect(deleteResponse.status).toBe(204)
    expect(mocks.service.delete).toHaveBeenCalledWith(userId)
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
    const app = createTestApp()

    const createResponse = await app.request('/api/system/users', {
      method: 'POST',
      body: JSON.stringify({ username: 'ada' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(createResponse.status).toBe(400)
    expect(await createResponse.json()).toEqual({ message: '请求体无效' })
    expect(mocks.service.create).not.toHaveBeenCalled()
  })

  it('returns update body validation errors before calling the user service', async () => {
    const app = createTestApp()

    const updateResponse = await app.request(`/api/system/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    })
    expect(updateResponse.status).toBe(400)
    expect(await updateResponse.json()).toEqual({ message: '请求体无效' })
    expect(mocks.service.update).not.toHaveBeenCalled()
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

  it('maps invalid department errors to route responses', async () => {
    const app = createTestApp()

    mocks.service.create.mockRejectedValueOnce(new UserInvalidDepartmentError())
    const departmentResponse = await app.request('/api/system/users', {
      method: 'POST',
      body: JSON.stringify({
        username: 'grace',
        nickname: 'Grace Hopper',
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(departmentResponse.status).toBe(400)
    expect(await departmentResponse.json()).toEqual({
      field: 'departmentIds',
      message: '部门不存在',
    })
  })

  it('maps invalid role errors to route responses', async () => {
    const app = createTestApp()

    mocks.service.update.mockRejectedValueOnce(new UserInvalidRoleError())
    const roleResponse = await app.request(`/api/system/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ nickname: 'Updated Ada' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(roleResponse.status).toBe(400)
    expect(await roleResponse.json()).toEqual({
      field: 'roleIds',
      message: '角色不存在',
    })
  })

  it('maps not-found errors to route responses', async () => {
    const app = createTestApp()

    mocks.service.get.mockRejectedValueOnce(new UserNotFoundError())
    const notFoundResponse = await app.request(`/api/system/users/${userId}`)
    expect(notFoundResponse.status).toBe(404)
    expect(await notFoundResponse.json()).toEqual({ message: '用户不存在' })
  })

  it('maps built-in user mutation errors to route responses', async () => {
    const app = createTestApp()

    mocks.service.delete.mockRejectedValueOnce(new BuiltInUserMutationError('delete'))
    const builtInResponse = await app.request(`/api/system/users/${userId}`, {
      method: 'DELETE',
    })
    expect(builtInResponse.status).toBe(409)
    expect(await builtInResponse.json()).toEqual({ message: '内置用户不能删除' })
  })
})
