import {
  DICTIONARY_STATUS_ENABLED,
  type DictionaryDetail,
  type DictionaryOptionsResponse,
} from '@rev30/contracts'
import type { Context, Next } from 'hono'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DictionaryCodeConflictError,
  DictionaryInvalidItemError,
  DictionaryItemValueConflictError,
  DictionaryNotFoundError,
} from '../../../../src/modules/system/dictionaries/errors'
import { createDictionaryRoutes } from '../../../../src/modules/system/dictionaries/routes'

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
    create: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
    list: vi.fn(),
    options: vi.fn(),
    update: vi.fn(),
  }

  return {
    accessMiddleware,
    createDictionaryService: vi.fn(() => service),
    requireAccess: vi.fn(() => accessMiddleware),
    service,
  }
})

vi.mock('../../../../src/middleware/access', () => ({
  requireAccess: mocks.requireAccess,
}))

vi.mock('../../../../src/modules/system/dictionaries/service', () => ({
  createDictionaryService: mocks.createDictionaryService,
}))

function createTestApp() {
  return new Hono().route('/api/system/dictionaries', createDictionaryRoutes({} as never))
}

describe('dictionary routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.values(mocks.service).forEach((mock) => mock.mockReset())
    mocks.requireAccess.mockReturnValue(mocks.accessMiddleware)
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

  it('registers expected access guards for every dictionary endpoint', () => {
    createTestApp()

    expect((mocks.requireAccess.mock.calls as unknown as [string][]).map(([code]) => code)).toEqual(
      [
        'system:dictionary:list',
        'system:dictionary:list',
        'system:dictionary:create',
        'system:dictionary:update',
        'system:dictionary:delete',
      ],
    )
  })

  it('parses list query and delegates to dictionary service', async () => {
    const app = createTestApp()

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
  })

  it('parses options query and delegates to dictionary service', async () => {
    const app = createTestApp()

    const response = await app.request('/api/system/dictionaries/options?codes=gender,user_status')

    expect(response.status).toBe(200)
    expect(mocks.service.options).toHaveBeenCalledWith({
      codes: ['gender', 'user_status'],
    })
    expect(mocks.service.get).not.toHaveBeenCalled()
  })

  it('delegates detail/create/update/delete requests', async () => {
    const app = createTestApp()

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
  })

  it('returns validation errors before calling service', async () => {
    const app = createTestApp()

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
  })

  it('matches /options static route before /:id validator', async () => {
    const app = createTestApp()

    const response = await app.request('/api/system/dictionaries/options?codes=gender')

    expect(response.status).toBe(200)
    expect(mocks.service.options).toHaveBeenCalledWith({
      codes: ['gender'],
    })
    expect(mocks.service.get).not.toHaveBeenCalled()
  })

  it('maps dictionary domain errors to route responses', async () => {
    const app = createTestApp()

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
