import type { Context, Next } from 'hono'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CONFIG_VALUE_TYPE_NUMBER } from '@rev30/contracts'
import {
  ConfigInvalidValueError,
  ConfigNotFoundError,
} from '../../../../src/modules/system/configs/errors'
import { createConfigRoutes } from '../../../../src/modules/system/configs/routes'

const configKey = 'auth.loginFailureMaxAttempts'
const config = {
  key: configKey,
  name: '登录失败最大次数（次）',
  description: '同一用户名在窗口期内允许的失败次数。',
  valueType: CONFIG_VALUE_TYPE_NUMBER,
  defaultValue: '5',
  customValue: null,
  value: '5',
}

const mocks = vi.hoisted(() => {
  const accessMiddleware = vi.fn(async (_c: Context, next: Next) => next())
  const service = {
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
    mocks.service.list.mockResolvedValue([config])
    mocks.service.get.mockResolvedValue(config)
    mocks.service.update.mockResolvedValue({ ...config, customValue: '8', value: '8' })
  })

  it('registers expected access guards for config endpoints', () => {
    createTestApp()

    expect((mocks.requireAccess.mock.calls as unknown as [string][]).map(([code]) => code)).toEqual(
      ['system:config:list', 'system:config:list', 'system:config:update'],
    )
  })

  it('delegates list, detail, and update requests', async () => {
    const app = createTestApp()

    const listResponse = await app.request('/api/system/configs')
    expect(listResponse.status).toBe(200)
    expect(mocks.service.list).toHaveBeenCalledWith()

    const detailResponse = await app.request(`/api/system/configs/${configKey}`)
    expect(detailResponse.status).toBe(200)
    expect(mocks.service.get).toHaveBeenCalledWith(configKey)

    const updateResponse = await app.request(`/api/system/configs/${configKey}`, {
      method: 'PUT',
      body: JSON.stringify({ customValue: '8' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(updateResponse.status).toBe(200)
    expect(mocks.service.update).toHaveBeenCalledWith(configKey, { customValue: '8' })
  })

  it('returns validation errors before calling service methods', async () => {
    const app = createTestApp()

    const keyResponse = await app.request('/api/system/configs/not-a-key')
    expect(keyResponse.status).toBe(400)
    expect(await keyResponse.json()).toEqual({ message: '配置键无效' })
    expect(mocks.service.get).not.toHaveBeenCalled()

    const bodyResponse = await app.request(`/api/system/configs/${configKey}`, {
      method: 'PUT',
      body: JSON.stringify({ customValue: '   ' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(bodyResponse.status).toBe(400)
    expect(await bodyResponse.json()).toEqual({
      field: 'customValue',
      message: '请输入自定义值',
    })
    expect(mocks.service.update).not.toHaveBeenCalled()
  })

  it('maps config domain errors to route responses', async () => {
    const app = createTestApp()

    mocks.service.get.mockRejectedValueOnce(new ConfigNotFoundError())
    const notFoundResponse = await app.request(`/api/system/configs/${configKey}`)
    expect(notFoundResponse.status).toBe(404)
    expect(await notFoundResponse.json()).toEqual({ message: '配置不存在' })

    mocks.service.update.mockRejectedValueOnce(
      new ConfigInvalidValueError('配置值必须是 1 到 20 之间的整数'),
    )
    const invalidValueResponse = await app.request(`/api/system/configs/${configKey}`, {
      method: 'PUT',
      body: JSON.stringify({ customValue: '100' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(invalidValueResponse.status).toBe(400)
    expect(await invalidValueResponse.json()).toEqual({
      field: 'customValue',
      message: '配置值必须是 1 到 20 之间的整数',
    })
  })
})
