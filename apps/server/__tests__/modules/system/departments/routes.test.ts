import type { Context, Next } from 'hono'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEPARTMENT_STATUS_ENABLED } from '@rev30/shared'
import {
  DepartmentConflictError,
  DepartmentDeleteConflictError,
  DepartmentInvalidParentError,
  DepartmentMoveConflictError,
  DepartmentNotFoundError,
} from '../../../../src/modules/system/departments/errors'
import { createDepartmentRoutes } from '../../../../src/modules/system/departments/routes'

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
}

const mocks = vi.hoisted(() => {
  const accessMiddleware = vi.fn(async (_c: Context, next: Next) => next())
  const service = {
    create: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
    list: vi.fn(),
    tree: vi.fn(),
    update: vi.fn(),
  }

  return {
    accessMiddleware,
    createDepartmentService: vi.fn(() => service),
    requireAccess: vi.fn(() => accessMiddleware),
    service,
  }
})

vi.mock('../../../../src/middleware/access', () => ({
  requireAccess: mocks.requireAccess,
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
    mocks.service.get.mockResolvedValue(department)
    mocks.service.create.mockResolvedValue(department)
    mocks.service.update.mockResolvedValue({ ...department, name: 'Platform Engineering' })
    mocks.service.delete.mockResolvedValue(undefined)
  })

  it('registers expected access guards for every department endpoint', () => {
    createTestApp()

    expect((mocks.requireAccess.mock.calls as unknown as [string][]).map(([code]) => code)).toEqual(
      [
        'system:department:list',
        'system:department:list',
        'system:department:list',
        'system:department:create',
        'system:department:update',
        'system:department:delete',
      ],
    )
  })

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

  it('delegates tree requests to the department service', async () => {
    const app = createTestApp()

    const treeResponse = await app.request('/api/system/departments/tree')
    expect(treeResponse.status).toBe(200)
    expect(mocks.service.tree).toHaveBeenCalledWith()
  })

  it('delegates detail requests by id', async () => {
    const app = createTestApp()

    const detailResponse = await app.request(`/api/system/departments/${departmentId}`)
    expect(detailResponse.status).toBe(200)
    expect(mocks.service.get).toHaveBeenCalledWith(departmentId)
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

  it('delegates update requests by id', async () => {
    const app = createTestApp()

    const updateResponse = await app.request(`/api/system/departments/${departmentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Platform Engineering' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(updateResponse.status).toBe(200)
    expect(mocks.service.update).toHaveBeenCalledWith(departmentId, {
      name: 'Platform Engineering',
    })
  })

  it('delegates delete requests by id', async () => {
    const app = createTestApp()

    const deleteResponse = await app.request(`/api/system/departments/${departmentId}`, {
      method: 'DELETE',
    })
    expect(deleteResponse.status).toBe(204)
    expect(mocks.service.delete).toHaveBeenCalledWith(departmentId)
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

  it('maps invalid parent errors to route responses', async () => {
    const app = createTestApp()

    mocks.service.create.mockRejectedValueOnce(new DepartmentInvalidParentError())
    const invalidParentResponse = await app.request('/api/system/departments', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Engineering',
        code: 'engineering',
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(invalidParentResponse.status).toBe(400)
    expect(await invalidParentResponse.json()).toEqual({ message: '上级部门不存在' })
  })

  it('maps not-found errors to route responses', async () => {
    const app = createTestApp()

    mocks.service.get.mockRejectedValueOnce(new DepartmentNotFoundError())
    const notFoundResponse = await app.request(`/api/system/departments/${departmentId}`)
    expect(notFoundResponse.status).toBe(404)
    expect(await notFoundResponse.json()).toEqual({ message: '部门不存在' })
  })

  it('maps conflict errors to route responses', async () => {
    const app = createTestApp()

    mocks.service.update.mockRejectedValueOnce(new DepartmentConflictError())
    const conflictResponse = await app.request(`/api/system/departments/${departmentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ code: 'engineering' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(conflictResponse.status).toBe(409)
    expect(await conflictResponse.json()).toEqual({
      field: 'code',
      message: '编码已存在',
    })
  })

  it('maps move conflict errors to route responses', async () => {
    const app = createTestApp()

    mocks.service.update.mockRejectedValueOnce(new DepartmentMoveConflictError())
    const moveResponse = await app.request(`/api/system/departments/${departmentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ parentId: departmentId }),
      headers: { 'content-type': 'application/json' },
    })
    expect(moveResponse.status).toBe(409)
    expect(await moveResponse.json()).toEqual({ message: '不能移动到自己或子部门下' })
  })

  it('maps delete conflict errors to route responses', async () => {
    const app = createTestApp()

    mocks.service.delete.mockRejectedValueOnce(
      new DepartmentDeleteConflictError('部门存在关联用户，不能删除'),
    )
    const deleteResponse = await app.request(`/api/system/departments/${departmentId}`, {
      method: 'DELETE',
    })
    expect(deleteResponse.status).toBe(409)
    expect(await deleteResponse.json()).toEqual({ message: '部门存在关联用户，不能删除' })
  })
})
