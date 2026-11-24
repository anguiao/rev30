import type { Context, Next } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CONFIG_VALUE_TYPE_NUMBER, type Config } from '@rev30/contracts'
import type { createConfigService } from '../../../../src/modules/system/configs/service'
import type { requireAccess } from '../../../../src/middleware/access'
import { createConfigRoutes } from '../../../../src/modules/system/configs/routes'
import { createOperationLogRouteTestApp } from '../../../helpers/operation-log'

type ConfigService = ReturnType<typeof createConfigService>

const configKey = 'auth.loginFailureMaxAttempts'
const config = {
  key: configKey,
  name: '登录失败最大次数（次）',
  description: '同一用户名在窗口期内允许的失败次数。',
  valueType: CONFIG_VALUE_TYPE_NUMBER,
  defaultValue: '5',
  customValue: null,
  value: '5',
} satisfies Config

const mocks = vi.hoisted(() => {
  const accessMiddleware = vi.fn(async (_c: Context, next: Next) => next())
  const service = {
    get: vi.fn<ConfigService['get']>(),
    list: vi.fn<ConfigService['list']>(),
    update: vi.fn<ConfigService['update']>(),
  }

  return {
    accessMiddleware,
    createConfigService: vi.fn(() => service),
    requireAccess: vi.fn<typeof requireAccess>(() => accessMiddleware),
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
  return createOperationLogRouteTestApp([]).route(
    '/api/system/configs',
    createConfigRoutes({} as never),
  )
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

  it.each([
    ['', 'GET', 'system:config:list', 'list', null, 200],
    [`/${configKey}`, 'GET', 'system:config:list', 'get', null, 200],
    [`/${configKey}`, 'PUT', 'system:config:update', 'update', { customValue: '8' }, 200],
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

      const denied = await app.request(`/api/system/configs${path}`, request)
      expect(denied.status).toBe(403)
      expect(await denied.json()).toEqual({ requiredAccess: code })
      for (const serviceMock of Object.values(mocks.service)) {
        expect(serviceMock).not.toHaveBeenCalled()
      }

      const allowed = await app.request(`/api/system/configs${path}`, {
        ...request,
        headers: { ...request.headers, 'x-test-access': code },
      })
      expect(allowed.status).toBe(status)
      expect(mocks.service[service]).toHaveBeenCalledOnce()
    },
  )

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
})
