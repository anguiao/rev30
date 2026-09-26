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
  type Resource,
} from '@rev30/contracts'
import type { createResourceService } from '../../../../src/modules/system/resources/service'
import type { requireAccess } from '../../../../src/middleware/access'
import type { AuthEnv } from '../../../../src/middleware/auth'
import { createResourceRoutes } from '../../../../src/modules/system/resources/routes'

type ResourceService = ReturnType<typeof createResourceService>

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
} satisfies Resource

const mocks = vi.hoisted(() => {
  const accessMiddleware = vi.fn(async (_c: Context, next: Next) => next())
  const service = {
    create: vi.fn<ResourceService['create']>(),
    delete: vi.fn<ResourceService['delete']>(),
    get: vi.fn<ResourceService['get']>(),
    list: vi.fn<ResourceService['list']>(),
    tree: vi.fn<ResourceService['tree']>(),
    treeOptions: vi.fn<ResourceService['treeOptions']>(),
    update: vi.fn<ResourceService['update']>(),
  }

  return {
    accessMiddleware,
    createResourceService: vi.fn(() => service),
    requireAccess: vi.fn<typeof requireAccess>(() => accessMiddleware),
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

  it.each([
    ['', 'GET', 'system:resource:list', 'list', null, 200],
    ['/tree', 'GET', 'system:resource:list', 'tree', null, 200],
    ['/options/tree', 'GET', 'system:resource:list', 'treeOptions', null, 200],
    [`/${resourceId}`, 'GET', 'system:resource:list', 'get', null, 200],
    [
      '',
      'POST',
      'system:resource:create',
      'create',
      { type: 'directory', name: 'System', code: 'test-system' },
      201,
    ],
    [`/${resourceId}`, 'PATCH', 'system:resource:update', 'update', { name: 'Settings' }, 200],
    [`/${resourceId}`, 'DELETE', 'system:resource:delete', 'delete', null, 204],
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

      const denied = await app.request(`/api/system/resources${path}`, request)
      expect(denied.status).toBe(403)
      expect(await denied.json()).toEqual({ requiredAccess: code })
      for (const serviceMock of Object.values(mocks.service)) {
        expect(serviceMock).not.toHaveBeenCalled()
      }

      const allowed = await app.request(`/api/system/resources${path}`, {
        ...request,
        headers: { ...request.headers, 'x-test-access': code },
      })
      expect(allowed.status).toBe(status)
      expect(mocks.service[service]).toHaveBeenCalledOnce()
    },
  )

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

  it.each([[[]], [[resourceId]]])(
    'parses tree options includeIds %j without routing to detail',
    async (includeIds) => {
      const app = createTestApp()

      const optionsResponse = await app.request(
        `/api/system/resources/options/tree${includeIds.length ? `?includeIds=${includeIds.join(',')}` : ''}`,
      )
      expect(optionsResponse.status).toBe(200)
      expect(mocks.service.treeOptions).toHaveBeenCalledWith({
        includeIds,
      })
      expect(mocks.service.get).not.toHaveBeenCalled()
    },
  )

  it('returns tree options query validation errors before calling the resource service', async () => {
    const app = createTestApp()

    const optionsResponse = await app.request('/api/system/resources/options/tree?includeIds=bad')
    expect(optionsResponse.status).toBe(400)
    expect(await optionsResponse.json()).toEqual({ message: '查询参数无效' })
    expect(mocks.service.treeOptions).not.toHaveBeenCalled()
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
})
