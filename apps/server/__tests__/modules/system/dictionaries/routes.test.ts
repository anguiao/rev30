import {
  DICTIONARY_STATUS_ENABLED,
  type DictionaryDetail,
  type DictionaryOptionsResponse,
} from '@rev30/contracts'
import type { Context, Next } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DictionaryCodeConflictError,
  DictionaryInvalidItemError,
  DictionaryItemValueConflictError,
  DictionaryNotFoundError,
} from '../../../../src/modules/system/dictionaries/errors'
import type { createDictionaryService } from '../../../../src/modules/system/dictionaries/service'
import type { requireAccess } from '../../../../src/middleware/access'
import { createDictionaryRoutes } from '../../../../src/modules/system/dictionaries/routes'
import type { OperationLogEvent } from '../../../../src/runtime/operation-log'
import { createOperationLogRouteTestApp } from '../../../helpers/operation-log'

type DictionaryService = ReturnType<typeof createDictionaryService>

const dictionaryId = '11111111-1111-4111-8111-111111111111'
const itemId = '22222222-2222-4222-8222-222222222222'
const dictionary: DictionaryDetail = {
  id: dictionaryId,
  code: 'gender',
  name: '性别',
  description: null,
  status: DICTIONARY_STATUS_ENABLED,
  sortOrder: 10,
  createdAt: '2026-05-20T00:00:00.000Z',
  updatedAt: '2026-05-20T00:00:00.000Z',
  items: [
    {
      id: itemId,
      typeId: dictionaryId,
      label: '男',
      value: 'male',
      description: null,
      status: DICTIONARY_STATUS_ENABLED,
      sortOrder: 10,
      createdAt: '2026-05-20T00:00:00.000Z',
      updatedAt: '2026-05-20T00:00:00.000Z',
    },
  ],
}

const mocks = vi.hoisted(() => {
  const accessMiddleware = vi.fn(async (_c: Context, next: Next) => next())
  const service = {
    create: vi.fn<DictionaryService['create']>(),
    delete: vi.fn<DictionaryService['delete']>(),
    get: vi.fn<DictionaryService['get']>(),
    list: vi.fn<DictionaryService['list']>(),
    options: vi.fn<DictionaryService['options']>(),
    update: vi.fn<DictionaryService['update']>(),
  }

  return {
    accessMiddleware,
    createDictionaryService: vi.fn(() => service),
    requireAccess: vi.fn<typeof requireAccess>(() => accessMiddleware),
    service,
  }
})

vi.mock('../../../../src/middleware/access', () => ({
  requireAccess: mocks.requireAccess,
}))

vi.mock('../../../../src/modules/system/dictionaries/service', () => ({
  createDictionaryService: mocks.createDictionaryService,
}))

function createTestApp(events: OperationLogEvent[] = []) {
  return createOperationLogRouteTestApp(events).route(
    '/api/system/dictionaries',
    createDictionaryRoutes({} as never),
  )
}

describe('dictionary routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.values(mocks.service).forEach((mock) => mock.mockReset())
    mocks.requireAccess.mockReturnValue(mocks.accessMiddleware)
    mocks.accessMiddleware.mockImplementation(async (_c: Context, next: Next) => next())
    mocks.createDictionaryService.mockReturnValue(mocks.service)
    mocks.service.list.mockResolvedValue({
      list: [{ ...dictionary, itemCount: 1 }],
      total: 1,
      page: 2,
      pageSize: 5,
    })
    mocks.service.get.mockResolvedValue(dictionary)
    mocks.service.options.mockResolvedValue({
      gender: [
        { label: '男', value: 'male' },
        { label: '女', value: 'female' },
      ],
      user_status: [],
    } satisfies DictionaryOptionsResponse)
    mocks.service.create.mockResolvedValue(dictionary)
    mocks.service.update.mockResolvedValue({ ...dictionary, name: '更新后字典' })
    mocks.service.delete.mockResolvedValue(undefined)
  })

  it.each([
    ['', 'GET', 'system:dictionary:list', 'list', null, 200],
    [`/${dictionaryId}`, 'GET', 'system:dictionary:list', 'get', null, 200],
    ['', 'POST', 'system:dictionary:create', 'create', { code: 'gender', name: '性别' }, 201],
    [
      `/${dictionaryId}`,
      'PUT',
      'system:dictionary:update',
      'update',
      { code: 'gender', name: '性别', description: null, status: 1, sortOrder: 0, items: [] },
      200,
    ],
    [`/${dictionaryId}`, 'DELETE', 'system:dictionary:delete', 'delete', null, 204],
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

      const denied = await app.request(`/api/system/dictionaries${path}`, request)
      expect(denied.status).toBe(403)
      expect(await denied.json()).toEqual({ requiredAccess: code })
      for (const serviceMock of Object.values(mocks.service)) {
        expect(serviceMock).not.toHaveBeenCalled()
      }

      const allowed = await app.request(`/api/system/dictionaries${path}`, {
        ...request,
        headers: { ...request.headers, 'x-test-access': code },
      })
      expect(allowed.status).toBe(status)
      expect(mocks.service[service]).toHaveBeenCalledOnce()
    },
  )

  it('parses list query and delegates to dictionary service', async () => {
    const events: OperationLogEvent[] = []
    const app = createTestApp(events)

    const response = await app.request(
      '/api/system/dictionaries?page=2&pageSize=5&keyword=gend&status=1',
    )

    expect(response.status).toBe(200)
    expect(mocks.service.list).toHaveBeenCalledWith({
      page: 2,
      pageSize: 5,
      keyword: 'gend',
      status: DICTIONARY_STATUS_ENABLED,
    })
    expect(events).toEqual([])
  })

  it('parses options query and delegates to dictionary service', async () => {
    const events: OperationLogEvent[] = []
    const app = createTestApp(events)

    const response = await app.request('/api/system/dictionaries/options?codes=gender,user_status')

    expect(response.status).toBe(200)
    expect(mocks.service.options).toHaveBeenCalledWith({
      codes: ['gender', 'user_status'],
    })
    expect(mocks.service.get).not.toHaveBeenCalled()
    expect(events).toEqual([])
  })

  it('delegates detail/create/update/delete requests', async () => {
    const events: OperationLogEvent[] = []
    const app = createTestApp(events)

    const detailResponse = await app.request(`/api/system/dictionaries/${dictionaryId}`)
    expect(detailResponse.status).toBe(200)
    expect(mocks.service.get).toHaveBeenCalledWith(dictionaryId)

    const createResponse = await app.request('/api/system/dictionaries', {
      method: 'POST',
      body: JSON.stringify({
        code: 'gender',
        name: '性别',
        items: [{ label: '男', value: 'male' }],
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(createResponse.status).toBe(201)
    expect(mocks.service.create).toHaveBeenCalledWith({
      code: 'gender',
      name: '性别',
      description: undefined,
      status: DICTIONARY_STATUS_ENABLED,
      sortOrder: 0,
      items: [
        {
          label: '男',
          value: 'male',
          description: undefined,
          status: DICTIONARY_STATUS_ENABLED,
          sortOrder: 0,
        },
      ],
    })

    const updateResponse = await app.request(`/api/system/dictionaries/${dictionaryId}`, {
      method: 'PUT',
      body: JSON.stringify({
        code: 'gender',
        name: '性别',
        description: null,
        status: DICTIONARY_STATUS_ENABLED,
        sortOrder: 10,
        items: [
          {
            id: itemId,
            label: '男',
            value: 'male',
            description: null,
            status: DICTIONARY_STATUS_ENABLED,
            sortOrder: 10,
          },
        ],
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(updateResponse.status).toBe(200)
    expect(mocks.service.update).toHaveBeenCalledWith(dictionaryId, {
      code: 'gender',
      name: '性别',
      description: null,
      status: DICTIONARY_STATUS_ENABLED,
      sortOrder: 10,
      items: [
        {
          id: itemId,
          label: '男',
          value: 'male',
          description: null,
          status: DICTIONARY_STATUS_ENABLED,
          sortOrder: 10,
        },
      ],
    })

    const deleteResponse = await app.request(`/api/system/dictionaries/${dictionaryId}`, {
      method: 'DELETE',
    })
    expect(deleteResponse.status).toBe(204)
    expect(mocks.service.delete).toHaveBeenCalledWith(dictionaryId)
    expect(events).toEqual([
      expect.objectContaining({
        action: 'system:dictionary:create',
        targetKey: 'gender',
        targetLabel: '性别',
        httpStatus: 201,
      }),
      expect.objectContaining({
        action: 'system:dictionary:update',
        targetKey: dictionaryId,
        targetLabel: '性别',
        httpStatus: 200,
      }),
      expect.objectContaining({
        action: 'system:dictionary:delete',
        targetKey: dictionaryId,
        targetLabel: null,
        httpStatus: 204,
      }),
    ])
  })

  it.each(['POST', 'PUT'] as const)(
    'rejects duplicate item values before %s reaches the service',
    async (method) => {
      const events: OperationLogEvent[] = []
      const app = createTestApp(events)
      const response = await app.request(
        `/api/system/dictionaries${method === 'PUT' ? `/${dictionaryId}` : ''}`,
        {
          method,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            code: 'item-value',
            name: '字典项值',
            description: null,
            status: DICTIONARY_STATUS_ENABLED,
            sortOrder: 0,
            items: [
              {
                ...(method === 'PUT' ? { id: itemId } : {}),
                label: '保留',
                value: 'same',
                description: null,
                status: DICTIONARY_STATUS_ENABLED,
                sortOrder: 0,
              },
              {
                label: '重复',
                value: 'same',
                description: null,
                status: DICTIONARY_STATUS_ENABLED,
                sortOrder: 1,
              },
            ],
          }),
        },
      )
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ message: '请求体无效' })
      expect(mocks.service.create).not.toHaveBeenCalled()
      expect(mocks.service.update).not.toHaveBeenCalled()
      expect(events).toEqual([])
    },
  )

  it('returns validation errors before calling service', async () => {
    const events: OperationLogEvent[] = []
    const app = createTestApp(events)

    const queryResponse = await app.request('/api/system/dictionaries?page=0')
    expect(queryResponse.status).toBe(400)
    expect(await queryResponse.json()).toEqual({ message: '查询参数无效' })
    expect(mocks.service.list).not.toHaveBeenCalled()

    const idResponse = await app.request('/api/system/dictionaries/not-a-uuid')
    expect(idResponse.status).toBe(400)
    expect(await idResponse.json()).toEqual({ message: '数据字典 ID 无效' })
    expect(mocks.service.get).not.toHaveBeenCalled()

    const optionsEmptyCodesResponse = await app.request('/api/system/dictionaries/options?codes=')
    expect(optionsEmptyCodesResponse.status).toBe(400)
    expect(await optionsEmptyCodesResponse.json()).toEqual({ message: '查询参数无效' })
    expect(mocks.service.options).not.toHaveBeenCalled()

    const optionsInvalidCodesResponse = await app.request(
      '/api/system/dictionaries/options?codes=Gender',
    )
    expect(optionsInvalidCodesResponse.status).toBe(400)
    expect(await optionsInvalidCodesResponse.json()).toEqual({ message: '查询参数无效' })
    expect(mocks.service.options).not.toHaveBeenCalled()

    const createResponse = await app.request('/api/system/dictionaries', {
      method: 'POST',
      body: JSON.stringify({ code: 'gender' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(createResponse.status).toBe(400)
    expect(await createResponse.json()).toEqual({ message: '请求体无效' })
    expect(mocks.service.create).not.toHaveBeenCalled()

    const updateResponse = await app.request(`/api/system/dictionaries/${dictionaryId}`, {
      method: 'PUT',
      body: JSON.stringify({ code: 'gender' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(updateResponse.status).toBe(400)
    expect(await updateResponse.json()).toEqual({ message: '请求体无效' })
    expect(mocks.service.update).not.toHaveBeenCalled()
    expect(events).toEqual([])
  })

  it('does not register requests rejected by the basic access guard', async () => {
    mocks.accessMiddleware.mockImplementationOnce(async (c) => {
      c.res = c.json({ message: '无权访问' }, 403)
    })
    const events: OperationLogEvent[] = []
    const app = createTestApp(events)

    const response = await app.request('/api/system/dictionaries', {
      method: 'POST',
      body: JSON.stringify({ code: 'gender', name: '性别' }),
      headers: { 'content-type': 'application/json' },
    })

    expect(response.status).toBe(403)
    expect(events).toEqual([])
    expect(mocks.service.create).not.toHaveBeenCalled()
  })

  it('maps dictionary domain errors to route responses', async () => {
    const events: OperationLogEvent[] = []
    const app = createTestApp(events)

    mocks.service.get.mockRejectedValueOnce(new DictionaryNotFoundError())
    const notFoundResponse = await app.request(`/api/system/dictionaries/${dictionaryId}`)
    expect(notFoundResponse.status).toBe(404)
    expect(await notFoundResponse.json()).toEqual({ message: '数据字典不存在' })

    mocks.service.create.mockRejectedValueOnce(new DictionaryCodeConflictError())
    const duplicateCodeResponse = await app.request('/api/system/dictionaries', {
      method: 'POST',
      body: JSON.stringify({ code: 'gender', name: '性别' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(duplicateCodeResponse.status).toBe(409)
    expect(await duplicateCodeResponse.json()).toEqual({
      field: 'code',
      message: '字典编码已存在',
    })
    expect(events).toEqual([
      expect.objectContaining({
        action: 'system:dictionary:create',
        targetKey: 'gender',
        targetLabel: '性别',
        httpStatus: 409,
        result: 'failure',
      }),
    ])

    mocks.service.update.mockRejectedValueOnce(new DictionaryItemValueConflictError())
    const duplicateItemValueResponse = await app.request(
      `/api/system/dictionaries/${dictionaryId}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          code: 'gender',
          name: '性别',
          description: null,
          status: DICTIONARY_STATUS_ENABLED,
          sortOrder: 10,
          items: [
            {
              id: itemId,
              label: '男',
              value: 'male',
              description: null,
              status: DICTIONARY_STATUS_ENABLED,
              sortOrder: 10,
            },
          ],
        }),
        headers: { 'content-type': 'application/json' },
      },
    )
    expect(duplicateItemValueResponse.status).toBe(409)
    expect(await duplicateItemValueResponse.json()).toEqual({
      field: 'items',
      message: '字典项值已存在',
    })

    mocks.service.update.mockRejectedValueOnce(new DictionaryInvalidItemError())
    const invalidItemResponse = await app.request(`/api/system/dictionaries/${dictionaryId}`, {
      method: 'PUT',
      body: JSON.stringify({
        code: 'gender',
        name: '性别',
        description: null,
        status: DICTIONARY_STATUS_ENABLED,
        sortOrder: 10,
        items: [
          {
            id: itemId,
            label: '男',
            value: 'male',
            description: null,
            status: DICTIONARY_STATUS_ENABLED,
            sortOrder: 10,
          },
        ],
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(invalidItemResponse.status).toBe(400)
    expect(await invalidItemResponse.json()).toEqual({ message: '字典项无效' })
  })
})
