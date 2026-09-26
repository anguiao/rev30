import type { Context, Next } from 'hono'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEPARTMENT_STATUS_ENABLED,
  DEPARTMENT_STATUS_DISABLED,
  type Department,
} from '@rev30/contracts'
import type { createDepartmentService } from '../../../../src/modules/system/departments/service'
import type { requireAccess } from '../../../../src/middleware/access'
import { createDepartmentRoutes } from '../../../../src/modules/system/departments/routes'

type DepartmentService = ReturnType<typeof createDepartmentService>

const departmentId = '22222222-2222-4222-8222-222222222222'
const department = {
  id: departmentId,
  name: 'Engineering',
  code: 'engineering',
  parentId: null,
  status: DEPARTMENT_STATUS_ENABLED,
  sortOrder: 10,
  createdAt: '2026-05-06T00:00:00.000Z',
  updatedAt: '2026-05-06T00:00:00.000Z',
} satisfies Department

const mocks = vi.hoisted(() => {
  const accessMiddleware = vi.fn(async (_c: Context, next: Next) => next())
  const service = {
    create: vi.fn<DepartmentService['create']>(),
    delete: vi.fn<DepartmentService['delete']>(),
    get: vi.fn<DepartmentService['get']>(),
    list: vi.fn<DepartmentService['list']>(),
    tree: vi.fn<DepartmentService['tree']>(),
    treeOptions: vi.fn<DepartmentService['treeOptions']>(),
    update: vi.fn<DepartmentService['update']>(),
  }

  return {
    accessMiddleware,
    createDepartmentService: vi.fn(() => service),
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

vi.mock('../../../../src/modules/system/departments/service', () => ({
  createDepartmentService: mocks.createDepartmentService,
}))

function createTestApp() {
  return new Hono().route('/api/system/departments', createDepartmentRoutes({} as never))
}

describe('department routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.values(mocks.service).forEach((mock) => mock.mockReset())
    mocks.requireAccess.mockReturnValue(mocks.accessMiddleware)
    mocks.createDepartmentService.mockReturnValue(mocks.service)
    mocks.service.list.mockResolvedValue({ list: [department], total: 1, page: 2, pageSize: 5 })
    mocks.service.tree.mockResolvedValue([{ ...department, children: [] }])
    mocks.service.treeOptions.mockResolvedValue([
      { ...department, status: DEPARTMENT_STATUS_DISABLED, children: [] },
    ])
    mocks.service.get.mockResolvedValue(department)
    mocks.service.create.mockResolvedValue(department)
    mocks.service.update.mockResolvedValue({ ...department, name: 'Platform Engineering' })
    mocks.service.delete.mockResolvedValue(undefined)
  })

  it.each([
    ['', 'GET', 'system:department:list', 'list', null, 200],
    ['/tree', 'GET', 'system:department:list', 'tree', null, 200],
    ['/options/tree', 'GET', 'system:department:list', 'treeOptions', null, 200],
    [`/${departmentId}`, 'GET', 'system:department:list', 'get', null, 200],
    [
      '',
      'POST',
      'system:department:create',
      'create',
      { name: 'Engineering', code: 'engineering' },
      201,
    ],
    [
      `/${departmentId}`,
      'PATCH',
      'system:department:update',
      'update',
      { name: 'Platform Engineering' },
      200,
    ],
    [`/${departmentId}`, 'DELETE', 'system:department:delete', 'delete', null, 204],
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

      const denied = await app.request(`/api/system/departments${path}`, request)
      expect(denied.status).toBe(403)
      expect(await denied.json()).toEqual({ requiredAccess: code })
      for (const serviceMock of Object.values(mocks.service)) {
        expect(serviceMock).not.toHaveBeenCalled()
      }

      const allowed = await app.request(`/api/system/departments${path}`, {
        ...request,
        headers: { ...request.headers, 'x-test-access': code },
      })
      expect(allowed.status).toBe(status)
      expect(mocks.service[service]).toHaveBeenCalledOnce()
    },
  )

  it('parses list query and delegates to the department service', async () => {
    const app = createTestApp()

    const listResponse = await app.request(
      `/api/system/departments?page=2&pageSize=5&keyword=eng&status=1&parentId=${departmentId}`,
    )
    expect(listResponse.status).toBe(200)
    expect(mocks.service.list).toHaveBeenCalledWith({
      keyword: 'eng',
      page: 2,
      pageSize: 5,
      parentId: departmentId,
      status: DEPARTMENT_STATUS_ENABLED,
    })
  })

  it.each([[[]], [[departmentId]]])(
    'parses tree options includeIds %j without routing to detail',
    async (includeIds) => {
      const app = createTestApp()

      const optionsResponse = await app.request(
        `/api/system/departments/options/tree${includeIds.length ? `?includeIds=${includeIds.join(',')}` : ''}`,
      )
      expect(optionsResponse.status).toBe(200)
      expect(mocks.service.treeOptions).toHaveBeenCalledWith({
        includeIds,
      })
      expect(mocks.service.get).not.toHaveBeenCalled()
    },
  )

  it('returns tree options query validation errors before calling the department service', async () => {
    const app = createTestApp()

    const optionsResponse = await app.request('/api/system/departments/options/tree?includeIds=bad')
    expect(optionsResponse.status).toBe(400)
    expect(await optionsResponse.json()).toEqual({ message: '查询参数无效' })
    expect(mocks.service.treeOptions).not.toHaveBeenCalled()
  })

  it('delegates create requests to the department service', async () => {
    const app = createTestApp()

    const createResponse = await app.request('/api/system/departments', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Engineering',
        code: 'engineering',
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(createResponse.status).toBe(201)
    expect(mocks.service.create).toHaveBeenCalledWith({
      name: 'Engineering',
      code: 'engineering',
      parentId: null,
      status: DEPARTMENT_STATUS_ENABLED,
      sortOrder: 0,
    })
  })

  it('returns query validation errors before calling the department service', async () => {
    const app = createTestApp()

    const listResponse = await app.request('/api/system/departments?page=0')
    expect(listResponse.status).toBe(400)
    expect(await listResponse.json()).toEqual({ message: '查询参数无效' })
    expect(mocks.service.list).not.toHaveBeenCalled()
  })

  it('returns id validation errors before calling department service methods', async () => {
    const app = createTestApp()

    const detailResponse = await app.request('/api/system/departments/not-a-uuid')
    expect(detailResponse.status).toBe(400)
    expect(await detailResponse.json()).toEqual({ message: '部门 ID 无效' })
    expect(mocks.service.get).not.toHaveBeenCalled()
  })

  it('returns create body validation errors before calling the department service', async () => {
    const app = createTestApp()

    const createResponse = await app.request('/api/system/departments', {
      method: 'POST',
      body: JSON.stringify({ name: 'Engineering' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(createResponse.status).toBe(400)
    expect(await createResponse.json()).toEqual({ message: '请求体无效' })
    expect(mocks.service.create).not.toHaveBeenCalled()
  })
})
