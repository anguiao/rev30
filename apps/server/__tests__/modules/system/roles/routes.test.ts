import type { Context, Next } from 'hono'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RESOURCE_TYPE_ACTION, ROLE_STATUS_ENABLED } from '@rev30/shared'
import {
  BuiltInAdminRoleMutationError,
  RoleConflictError,
  RoleDeleteConflictError,
  RoleInvalidResourceAssignmentError,
  RoleInvalidResourceError,
  RoleNotFoundError,
} from '../../../../src/modules/system/roles/errors'
import { createRoleRoutes } from '../../../../src/modules/system/roles/routes'

const roleId = '33333333-3333-4333-8333-333333333333'
const resourceId = '44444444-4444-4444-8444-444444444444'
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
}

const mocks = vi.hoisted(() => {
  const accessMiddleware = vi.fn(async (_c: Context, next: Next) => next())
  const service = {
    create: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
  }

  return {
    accessMiddleware,
    createRoleService: vi.fn(() => service),
    requireAccess: vi.fn(() => accessMiddleware),
    service,
  }
})

vi.mock('../../../../src/middleware/access', () => ({
  requireAccess: mocks.requireAccess,
}))

vi.mock('../../../../src/modules/system/roles/service', () => ({
  createRoleService: mocks.createRoleService,
}))

function createTestApp() {
  return new Hono().route('/api/system/roles', createRoleRoutes({} as never))
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
    mocks.service.get.mockResolvedValue(role)
    mocks.service.create.mockResolvedValue(role)
    mocks.service.update.mockResolvedValue({ ...role, name: 'Updated Administrator' })
    mocks.service.delete.mockResolvedValue(undefined)
  })

  it('registers expected access guards for every role endpoint', () => {
    createTestApp()

    expect((mocks.requireAccess.mock.calls as unknown as [string][]).map(([code]) => code)).toEqual(
      [
        'system:role:list',
        'system:role:list',
        'system:role:create',
        'system:role:update',
        'system:role:delete',
      ],
    )
  })

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

  it('delegates detail requests by id', async () => {
    const app = createTestApp()

    const detailResponse = await app.request(`/api/system/roles/${roleId}`)
    expect(detailResponse.status).toBe(200)
    expect(mocks.service.get).toHaveBeenCalledWith(roleId)
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
    expect(mocks.service.create).toHaveBeenCalledWith({
      name: 'Administrator',
      code: 'test-admin',
      resourceIds: [resourceId],
      status: ROLE_STATUS_ENABLED,
      sortOrder: 0,
    })
  })

  it('delegates update requests by id', async () => {
    const app = createTestApp()

    const updateResponse = await app.request(`/api/system/roles/${roleId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Updated Administrator' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(updateResponse.status).toBe(200)
    expect(mocks.service.update).toHaveBeenCalledWith(roleId, {
      name: 'Updated Administrator',
    })
  })

  it('delegates delete requests by id', async () => {
    const app = createTestApp()

    const deleteResponse = await app.request(`/api/system/roles/${roleId}`, {
      method: 'DELETE',
    })
    expect(deleteResponse.status).toBe(204)
    expect(mocks.service.delete).toHaveBeenCalledWith(roleId)
  })

  it('returns query validation errors before calling the role service', async () => {
    const app = createTestApp()

    const listResponse = await app.request('/api/system/roles?page=0')
    expect(listResponse.status).toBe(400)
    expect(await listResponse.json()).toEqual({ message: '查询参数无效' })
    expect(mocks.service.list).not.toHaveBeenCalled()
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

  it('maps invalid resource errors to route responses', async () => {
    const app = createTestApp()

    mocks.service.create.mockRejectedValueOnce(new RoleInvalidResourceError())
    const invalidResourceResponse = await app.request('/api/system/roles', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Administrator',
        code: 'test-admin',
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(invalidResourceResponse.status).toBe(400)
    expect(await invalidResourceResponse.json()).toEqual({ message: '权限资源不存在' })
  })

  it('maps invalid resource assignment errors to route responses', async () => {
    const app = createTestApp()

    mocks.service.create.mockRejectedValueOnce(
      new RoleInvalidResourceAssignmentError('子级权限资源需要包含所有上级权限资源'),
    )
    const invalidAssignmentResponse = await app.request('/api/system/roles', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Operator',
        code: 'operator',
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(invalidAssignmentResponse.status).toBe(400)
    expect(await invalidAssignmentResponse.json()).toEqual({
      field: 'resourceIds',
      message: '子级权限资源需要包含所有上级权限资源',
    })
  })

  it('maps not-found errors to route responses', async () => {
    const app = createTestApp()

    mocks.service.get.mockRejectedValueOnce(new RoleNotFoundError())
    const notFoundResponse = await app.request(`/api/system/roles/${roleId}`)
    expect(notFoundResponse.status).toBe(404)
    expect(await notFoundResponse.json()).toEqual({ message: '角色不存在' })
  })

  it('maps conflict errors to route responses', async () => {
    const app = createTestApp()

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
  })

  it('maps built-in role mutation errors to route responses', async () => {
    const app = createTestApp()

    mocks.service.update.mockRejectedValueOnce(new BuiltInAdminRoleMutationError('edit'))
    const builtInResponse = await app.request(`/api/system/roles/${roleId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Root Administrator' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(builtInResponse.status).toBe(409)
    expect(await builtInResponse.json()).toEqual({ message: '内置 admin 角色不能编辑' })
  })

  it('maps delete conflict errors to route responses', async () => {
    const app = createTestApp()

    mocks.service.delete.mockRejectedValueOnce(new RoleDeleteConflictError())
    const deleteResponse = await app.request(`/api/system/roles/${roleId}`, {
      method: 'DELETE',
    })
    expect(deleteResponse.status).toBe(409)
    expect(await deleteResponse.json()).toEqual({ message: '角色存在关联用户，不能删除' })
  })
})
