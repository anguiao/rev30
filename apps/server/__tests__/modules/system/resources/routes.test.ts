import type { Context, Next } from 'hono'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RESOURCE_OPEN_TARGET_SELF,
  RESOURCE_STATUS_DISABLED,
  RESOURCE_STATUS_ENABLED,
  RESOURCE_TYPE_DIRECTORY,
  RESOURCE_TYPE_MENU,
  USER_STATUS_ENABLED,
  type User,
} from '@rev30/contracts'
import type { AuthEnv } from '../../../../src/middleware/auth'
import {
  ResourceConflictError,
  ResourceDeleteConflictError,
  ResourceInvalidParentError,
  ResourceInvalidTypeFieldsError,
  ResourceMoveConflictError,
  ResourceMutationForbiddenError,
  ResourceNotFoundError,
  ResourceRoleAuthorizationConflictError,
} from '../../../../src/modules/system/resources/errors'
import { createResourceRoutes } from '../../../../src/modules/system/resources/routes'

const resourceId = '55555555-5555-4555-8555-555555555555'
const parentId = '66666666-6666-4666-8666-666666666666'
const actorId = '77777777-7777-4777-8777-777777777777'
const userAccess = {
  accessCodes: ['system:resource:create', 'system:resource:update'],
  isAdmin: false,
}
const actor = {
  id: actorId,
  username: 'resource-manager',
  nickname: 'Resource Manager',
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
const resource = {
  id: resourceId,
  parentId: null,
  type: RESOURCE_TYPE_DIRECTORY,
  name: 'System',
  code: 'test-system',
  path: null,
  externalUrl: null,
  openTarget: RESOURCE_OPEN_TARGET_SELF,
  icon: null,
  hidden: false,
  status: RESOURCE_STATUS_ENABLED,
  sortOrder: 10,
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
    tree: vi.fn(),
    treeOptions: vi.fn(),
    update: vi.fn(),
  }

  return {
    accessMiddleware,
    createResourceService: vi.fn(() => service),
    requireAccess: vi.fn(() => accessMiddleware),
    service,
  }
})

vi.mock('../../../../src/middleware/access', () => ({
  requireAccess: mocks.requireAccess,
}))

vi.mock('../../../../src/middleware/operation-log', () => ({
  recordOperation: vi.fn(),
}))

vi.mock('../../../../src/modules/system/resources/service', () => ({
  createResourceService: mocks.createResourceService,
}))

function createTestApp() {
  return new Hono<AuthEnv>()
    .use('*', async (c, next) => {
      c.set('currentUser', actor)
      c.set('accessCodes', userAccess.accessCodes)
      c.set('isAdmin', userAccess.isAdmin)
      await next()
    })
    .route('/api/system/resources', createResourceRoutes({} as never))
}

describe('resource routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.values(mocks.service).forEach((mock) => mock.mockReset())
    mocks.requireAccess.mockReturnValue(mocks.accessMiddleware)
    mocks.createResourceService.mockReturnValue(mocks.service)
    mocks.service.list.mockResolvedValue({ list: [resource], total: 1, page: 2, pageSize: 5 })
    mocks.service.tree.mockResolvedValue([{ ...resource, children: [] }])
    mocks.service.treeOptions.mockResolvedValue([
      { ...resource, status: RESOURCE_STATUS_DISABLED, children: [] },
    ])
    mocks.service.get.mockResolvedValue(resource)
    mocks.service.create.mockResolvedValue(resource)
    mocks.service.update.mockResolvedValue({ ...resource, name: 'Settings' })
    mocks.service.delete.mockResolvedValue(undefined)
  })

  it('registers expected access guards for every resource endpoint', () => {
    createTestApp()

    expect((mocks.requireAccess.mock.calls as unknown as [string][]).map(([code]) => code)).toEqual(
      [
        'system:resource:list',
        'system:resource:list',
        'system:resource:list',
        'system:resource:list',
        'system:resource:create',
        'system:resource:update',
        'system:resource:delete',
      ],
    )
  })

  it('parses list query and delegates to the resource service', async () => {
    const app = createTestApp()

    const listResponse = await app.request(
      `/api/system/resources?page=2&pageSize=5&keyword=sys&type=menu&status=1&parentId=${parentId}`,
    )
    expect(listResponse.status).toBe(200)
    expect(mocks.service.list).toHaveBeenCalledWith({
      keyword: 'sys',
      page: 2,
      pageSize: 5,
      parentId,
      status: RESOURCE_STATUS_ENABLED,
      type: RESOURCE_TYPE_MENU,
    })
  })

  it('delegates tree requests to the resource service', async () => {
    const app = createTestApp()

    const treeResponse = await app.request('/api/system/resources/tree')
    expect(treeResponse.status).toBe(200)
    expect(mocks.service.tree).toHaveBeenCalledWith()
  })

  it('parses tree options query and delegates to the resource service', async () => {
    const app = createTestApp()

    const optionsResponse = await app.request(
      `/api/system/resources/options/tree?includeIds=${resourceId}`,
    )
    expect(optionsResponse.status).toBe(200)
    expect(mocks.service.treeOptions).toHaveBeenCalledWith({
      includeIds: [resourceId],
    })
  })

  it('returns tree options query validation errors before calling the resource service', async () => {
    const app = createTestApp()

    const optionsResponse = await app.request('/api/system/resources/options/tree?includeIds=bad')
    expect(optionsResponse.status).toBe(400)
    expect(await optionsResponse.json()).toEqual({ message: '查询参数无效' })
    expect(mocks.service.treeOptions).not.toHaveBeenCalled()
  })

  it('matches static /options/tree before dynamic /:id route', async () => {
    const app = createTestApp()

    const optionsResponse = await app.request('/api/system/resources/options/tree')
    expect(optionsResponse.status).toBe(200)
    expect(mocks.service.treeOptions).toHaveBeenCalledWith({ includeIds: [] })
    expect(mocks.service.get).not.toHaveBeenCalled()
  })

  it('delegates detail requests by id', async () => {
    const app = createTestApp()

    const detailResponse = await app.request(`/api/system/resources/${resourceId}`)
    expect(detailResponse.status).toBe(200)
    expect(mocks.service.get).toHaveBeenCalledWith(resourceId)
  })

  it('delegates create requests to the resource service', async () => {
    const app = createTestApp()

    const createResponse = await app.request('/api/system/resources', {
      method: 'POST',
      body: JSON.stringify({
        type: RESOURCE_TYPE_DIRECTORY,
        name: 'System',
        code: 'test-system',
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(createResponse.status).toBe(201)
    expect(mocks.service.create).toHaveBeenCalledWith(
      {
        type: RESOURCE_TYPE_DIRECTORY,
        name: 'System',
        code: 'test-system',
        parentId: null,
        path: null,
        externalUrl: null,
        openTarget: RESOURCE_OPEN_TARGET_SELF,
        icon: null,
        hidden: false,
        status: RESOURCE_STATUS_ENABLED,
        sortOrder: 0,
      },
      userAccess,
    )
  })

  it('delegates update requests by id', async () => {
    const app = createTestApp()

    const updateResponse = await app.request(`/api/system/resources/${resourceId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Settings' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(updateResponse.status).toBe(200)
    expect(mocks.service.update).toHaveBeenCalledWith(resourceId, { name: 'Settings' }, userAccess)
  })

  it('delegates delete requests by id', async () => {
    const app = createTestApp()

    const deleteResponse = await app.request(`/api/system/resources/${resourceId}`, {
      method: 'DELETE',
    })
    expect(deleteResponse.status).toBe(204)
    expect(mocks.service.delete).toHaveBeenCalledWith(resourceId, userAccess)
  })

  it('returns query validation errors before calling the resource service', async () => {
    const app = createTestApp()

    const listResponse = await app.request('/api/system/resources?page=0')
    expect(listResponse.status).toBe(400)
    expect(await listResponse.json()).toEqual({ message: '查询参数无效' })
    expect(mocks.service.list).not.toHaveBeenCalled()
  })

  it('returns id validation errors before calling resource service methods', async () => {
    const app = createTestApp()

    const detailResponse = await app.request('/api/system/resources/not-a-uuid')
    expect(detailResponse.status).toBe(400)
    expect(await detailResponse.json()).toEqual({ message: '资源 ID 无效' })
    expect(mocks.service.get).not.toHaveBeenCalled()
  })

  it('returns create body validation errors before calling the resource service', async () => {
    const app = createTestApp()

    const createResponse = await app.request('/api/system/resources', {
      method: 'POST',
      body: JSON.stringify({
        type: RESOURCE_TYPE_DIRECTORY,
        code: 'test-system',
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(createResponse.status).toBe(400)
    expect(await createResponse.json()).toEqual({ message: '请求体无效' })
    expect(mocks.service.create).not.toHaveBeenCalled()
  })

  it('maps invalid final type field errors to route responses', async () => {
    const app = createTestApp()

    mocks.service.update.mockRejectedValueOnce(
      new ResourceInvalidTypeFieldsError('内部菜单路径不能为空', 'path'),
    )
    const invalidTypeResponse = await app.request(`/api/system/resources/${resourceId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Users' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(invalidTypeResponse.status).toBe(400)
    expect(await invalidTypeResponse.json()).toEqual({
      field: 'path',
      message: '内部菜单路径不能为空',
    })
  })

  it('maps invalid parent errors to route responses', async () => {
    const app = createTestApp()

    mocks.service.create.mockRejectedValueOnce(new ResourceInvalidParentError())
    const invalidParentResponse = await app.request('/api/system/resources', {
      method: 'POST',
      body: JSON.stringify({
        type: RESOURCE_TYPE_DIRECTORY,
        name: 'System',
        code: 'test-system',
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(invalidParentResponse.status).toBe(400)
    expect(await invalidParentResponse.json()).toEqual({ message: '上级权限资源不存在' })
  })

  it('maps not-found errors to route responses', async () => {
    const app = createTestApp()

    mocks.service.get.mockRejectedValueOnce(new ResourceNotFoundError())
    const notFoundResponse = await app.request(`/api/system/resources/${resourceId}`)
    expect(notFoundResponse.status).toBe(404)
    expect(await notFoundResponse.json()).toEqual({ message: '权限资源不存在' })
  })

  it('maps conflict errors to route responses', async () => {
    const app = createTestApp()

    mocks.service.update.mockRejectedValueOnce(new ResourceConflictError())
    const conflictResponse = await app.request(`/api/system/resources/${resourceId}`, {
      method: 'PATCH',
      body: JSON.stringify({ code: 'test-system' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(conflictResponse.status).toBe(409)
    expect(await conflictResponse.json()).toEqual({ message: '权限编码已存在' })
  })

  it('maps move conflict errors to route responses', async () => {
    const app = createTestApp()

    mocks.service.update.mockRejectedValueOnce(new ResourceMoveConflictError())
    const moveResponse = await app.request(`/api/system/resources/${resourceId}`, {
      method: 'PATCH',
      body: JSON.stringify({ parentId: resourceId }),
      headers: { 'content-type': 'application/json' },
    })
    expect(moveResponse.status).toBe(409)
    expect(await moveResponse.json()).toEqual({ message: '不能移动到自己或子级权限资源下' })
  })

  it('maps delete conflict errors to route responses', async () => {
    const app = createTestApp()

    mocks.service.delete.mockRejectedValueOnce(new ResourceDeleteConflictError())
    const deleteResponse = await app.request(`/api/system/resources/${resourceId}`, {
      method: 'DELETE',
    })
    expect(deleteResponse.status).toBe(409)
    expect(await deleteResponse.json()).toEqual({ message: '权限资源存在子级权限资源，不能删除' })
  })

  it('maps role authorization conflict errors to route responses', async () => {
    const app = createTestApp()

    mocks.service.delete.mockRejectedValueOnce(new ResourceRoleAuthorizationConflictError())
    const roleAuthorizationResponse = await app.request(`/api/system/resources/${resourceId}`, {
      method: 'DELETE',
    })
    expect(roleAuthorizationResponse.status).toBe(409)
    expect(await roleAuthorizationResponse.json()).toEqual({
      message: '权限资源存在角色授权，不能删除',
    })
  })

  it('maps forbidden resource mutations to route responses', async () => {
    const app = createTestApp()

    mocks.service.update.mockRejectedValueOnce(new ResourceMutationForbiddenError('code'))
    const response = await app.request(`/api/system/resources/${resourceId}`, {
      method: 'PATCH',
      body: JSON.stringify({ code: 'system:user:delete' }),
      headers: { 'content-type': 'application/json' },
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ message: '非管理员不能修改权限编码' })

    mocks.service.update.mockRejectedValueOnce(new ResourceMutationForbiddenError('access-scope'))
    const subtreeResponse = await app.request(`/api/system/resources/${resourceId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: RESOURCE_STATUS_DISABLED }),
      headers: { 'content-type': 'application/json' },
    })

    expect(subtreeResponse.status).toBe(403)
    expect(await subtreeResponse.json()).toEqual({
      message: '不能管理超出自身权限范围的资源',
    })
  })
})
