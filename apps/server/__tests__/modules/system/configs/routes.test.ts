import type { Context, Next } from 'hono'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CONFIG_STATUS_ENABLED, CONFIG_VALUE_TYPE_STRING } from '@rev30/contracts'
import {
  ConfigConflictError,
  ConfigInvalidValueError,
  ConfigNotFoundError,
} from '../../../../src/modules/system/configs/errors'
import { createConfigRoutes } from '../../../../src/modules/system/configs/routes'

const configId = '11111111-1111-4111-8111-111111111111'
const config = {
  id: configId,
  groupCode: 'site',
  key: 'site.title',
  name: '站点名称',
  valueType: CONFIG_VALUE_TYPE_STRING,
  value: 'Rev30',
  description: '后台显示名称',
  status: CONFIG_STATUS_ENABLED,
  sortOrder: 10,
  createdAt: '2026-05-18T00:00:00.000Z',
  updatedAt: '2026-05-18T00:00:00.000Z',
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
    createConfigService: vi.fn(() => service),
    requireAccess: vi.fn(() => accessMiddleware),
    service,
  }
})

vi.mock('../../../../src/middleware/access', () => ({
  requireAccess: mocks.requireAccess,
}))

vi.mock('../../../../src/modules/system/configs/service', () => ({
  createConfigService: mocks.createConfigService,
}))

function createTestApp() {
  return new Hono().route('/api/system/configs', createConfigRoutes({} as never))
}

describe('config routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.values(mocks.service).forEach((mock) => mock.mockReset())
    mocks.requireAccess.mockReturnValue(mocks.accessMiddleware)
    mocks.createConfigService.mockReturnValue(mocks.service)
    mocks.service.list.mockResolvedValue({
      list: [config],
      total: 1,
      page: 2,
      pageSize: 5,
    })
    mocks.service.get.mockResolvedValue(config)
    mocks.service.create.mockResolvedValue(config)
    mocks.service.update.mockResolvedValue({ ...config, name: '新站点名称' })
    mocks.service.delete.mockResolvedValue(undefined)
  })

  it('registers expected access guards for every config endpoint', () => {
    createTestApp()

    expect((mocks.requireAccess.mock.calls as unknown as [string][]).map(([code]) => code)).toEqual(
      [
        'system:config:list',
        'system:config:list',
        'system:config:create',
        'system:config:update',
        'system:config:delete',
      ],
    )
  })

  it('parses list query and delegates to the config service', async () => {
    const app = createTestApp()

    const response = await app.request(
      '/api/system/configs?page=2&pageSize=5&keyword=title&groupCode=site&valueType=string&status=1',
    )

    expect(response.status).toBe(200)
    expect(mocks.service.list).toHaveBeenCalledWith({
      page: 2,
      pageSize: 5,
      keyword: 'title',
      groupCode: 'site',
      valueType: CONFIG_VALUE_TYPE_STRING,
      status: CONFIG_STATUS_ENABLED,
    })
  })

  it('delegates detail, create, update, and delete requests', async () => {
    const app = createTestApp()

    expect((await app.request(`/api/system/configs/${configId}`)).status).toBe(200)
    expect(mocks.service.get).toHaveBeenCalledWith(configId)

    const createResponse = await app.request('/api/system/configs', {
      method: 'POST',
      body: JSON.stringify({
        groupCode: 'site',
        key: 'site.title',
        name: '站点名称',
        valueType: CONFIG_VALUE_TYPE_STRING,
        value: 'Rev30',
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(createResponse.status).toBe(201)
    expect(mocks.service.create).toHaveBeenCalledWith({
      groupCode: 'site',
      key: 'site.title',
      name: '站点名称',
      valueType: CONFIG_VALUE_TYPE_STRING,
      value: 'Rev30',
      status: CONFIG_STATUS_ENABLED,
      sortOrder: 0,
    })

    const updateResponse = await app.request(`/api/system/configs/${configId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: '新站点名称' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(updateResponse.status).toBe(200)
    expect(mocks.service.update).toHaveBeenCalledWith(configId, { name: '新站点名称' })

    const deleteResponse = await app.request(`/api/system/configs/${configId}`, {
      method: 'DELETE',
    })
    expect(deleteResponse.status).toBe(204)
    expect(mocks.service.delete).toHaveBeenCalledWith(configId)
  })

  it('returns validation errors before calling service methods', async () => {
    const app = createTestApp()

    const queryResponse = await app.request('/api/system/configs?page=0')
    expect(queryResponse.status).toBe(400)
    expect(await queryResponse.json()).toEqual({ message: '查询参数无效' })
    expect(mocks.service.list).not.toHaveBeenCalled()

    const idResponse = await app.request('/api/system/configs/not-a-uuid')
    expect(idResponse.status).toBe(400)
    expect(await idResponse.json()).toEqual({ message: '配置 ID 无效' })
    expect(mocks.service.get).not.toHaveBeenCalled()

    const createResponse = await app.request('/api/system/configs', {
      method: 'POST',
      body: JSON.stringify({ key: 'site.title' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(createResponse.status).toBe(400)
    expect(await createResponse.json()).toEqual({ message: '请求体无效' })
    expect(mocks.service.create).not.toHaveBeenCalled()

    const createInvalidValueResponse = await app.request('/api/system/configs', {
      method: 'POST',
      body: JSON.stringify({
        groupCode: 'site',
        key: 'site.retry',
        name: '重试次数',
        valueType: 'number',
        value: 'abc',
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(createInvalidValueResponse.status).toBe(400)
    expect(await createInvalidValueResponse.json()).toEqual({
      field: 'value',
      message: '配置值必须是有限数字',
    })
    expect(mocks.service.create).not.toHaveBeenCalled()
  })

  it('maps config domain errors to route responses', async () => {
    const app = createTestApp()

    mocks.service.get.mockRejectedValueOnce(new ConfigNotFoundError())
    const notFoundResponse = await app.request(`/api/system/configs/${configId}`)
    expect(notFoundResponse.status).toBe(404)
    expect(await notFoundResponse.json()).toEqual({ message: '配置不存在' })

    mocks.service.create.mockRejectedValueOnce(new ConfigConflictError())
    const conflictResponse = await app.request('/api/system/configs', {
      method: 'POST',
      body: JSON.stringify({
        groupCode: 'site',
        key: 'site.title',
        name: '站点名称',
        valueType: CONFIG_VALUE_TYPE_STRING,
        value: 'Rev30',
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(conflictResponse.status).toBe(409)
    expect(await conflictResponse.json()).toEqual({ field: 'key', message: '配置键已存在' })

    mocks.service.update.mockRejectedValueOnce(new ConfigInvalidValueError('配置值必须是有限数字'))
    const invalidValueResponse = await app.request(`/api/system/configs/${configId}`, {
      method: 'PATCH',
      body: JSON.stringify({ valueType: 'number', value: 'abc' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(invalidValueResponse.status).toBe(400)
    expect(await invalidValueResponse.json()).toEqual({
      field: 'value',
      message: '配置值必须是有限数字',
    })
  })
})
