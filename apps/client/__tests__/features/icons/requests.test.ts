import { beforeEach, describe, expect, it } from 'vitest'

import {
  searchIcons,
  createCustomIconSet,
  deleteCustomIcon,
  deleteCustomIconSet,
  exportCustomIconSet,
  getCustomIconSet,
  listBuiltinIcons,
  listBuiltinIconSets,
  listCustomIcons,
  listCustomIconSets,
  updateCustomIcon,
  updateCustomIconSet,
  uploadCustomIcons,
} from '../../../src/features/icons/requests'

import {
  createFetchMock,
  expectFetchCall,
  jsonResponse,
  emptyResponse,
  expectJsonBody,
} from '../../helpers/fetch'

import { createTestPinia } from '../../helpers/pinia'

import { type CustomIconSet } from '@rev30/contracts'

import { ApiRequestError } from '../../../src/utils/request'

import { useAuthStore } from '../../../src/stores/auth'

beforeEach(() => {
  createTestPinia()
})

const customIconSetResponse: CustomIconSet = {
  prefix: 'acme',
  name: 'Acme Icons',
  description: null,
  iconCount: 2,
  createdAt: '2026-06-15T00:00:00.000Z',
  updatedAt: '2026-06-15T01:00:00.000Z',
}

const builtinIconResponse = {
  icon: 'lucide:user-add',
  prefix: 'lucide',
  name: 'user-add',
  setName: 'Lucide',
  body: '<path d="M0 0h24v24H0z"/>',
  width: 24,
  height: 24,
}

const customIconResponse = {
  ...builtinIconResponse,
  icon: 'acme:user-add',
  prefix: 'acme',
  setName: 'Acme Icons',
  createdAt: '2026-06-15T00:00:00.000Z',
  updatedAt: '2026-06-15T01:00:00.000Z',
  keywords: [],
}

describe('icons request helpers', () => {
  it('searches icons through the public icon endpoint', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({
        list: [
          {
            icon: 'lucide:users',
            prefix: 'lucide',
            name: 'users',
            collection: 'Lucide',
            palette: false,
          },
        ],
      }),
    )

    const result = await searchIcons({ keyword: '用户', limit: 20 })

    expect(result.list[0]?.icon).toBe('lucide:users')
    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/icons/search',
      query: {
        keyword: '用户',
        limit: '20',
      },
    })
  })

  it('gets custom icon set detail and parses response', async () => {
    const fetchMock = createFetchMock(jsonResponse(customIconSetResponse))
    useAuthStore().accessToken = 'access-token'

    const result = await getCustomIconSet('acme')

    expect(result).toEqual(customIconSetResponse)
    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/content/icon-sets/custom/acme',
    })
  })

  it('lists built-in and custom icon sets with normalized filters', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({
        list: [{ prefix: 'lucide', name: 'Lucide', total: 1000 }],
        total: 1,
      }),
      jsonResponse({
        list: [customIconSetResponse],
        total: 1,
      }),
    )
    useAuthStore().accessToken = 'access-token'

    await expect(listBuiltinIconSets({ keyword: 'user' })).resolves.toMatchObject({ total: 1 })
    await expect(listCustomIconSets({ keyword: 'acme' })).resolves.toMatchObject({
      list: [{ prefix: 'acme' }],
      total: 1,
    })

    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/content/icon-sets/builtin',
      query: { keyword: 'user' },
    })
    expectFetchCall(fetchMock, 1, {
      method: 'GET',
      pathname: '/api/content/icon-sets/custom',
      query: { keyword: 'acme' },
    })
  })

  it('lists built-in and custom icons with cursor pagination', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({
        list: [builtinIconResponse],
        nextCursor: 'lucide:user-check',
        pageSize: 20,
      }),
      jsonResponse({
        list: [customIconResponse],
        nextCursor: null,
        pageSize: 20,
      }),
    )
    useAuthStore().accessToken = 'access-token'

    await expect(
      listBuiltinIcons({
        keyword: 'user',
        prefix: 'lucide',
        pageSize: 20,
      }),
    ).resolves.toMatchObject({ nextCursor: 'lucide:user-check' })
    await expect(
      listCustomIcons({
        keyword: 'user',
        prefix: 'acme',
        cursor: 'acme:user-add',
        pageSize: 20,
      }),
    ).resolves.toMatchObject({ list: [{ icon: 'acme:user-add' }], nextCursor: null })

    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/content/icon-sets/builtin/icons',
      query: {
        keyword: 'user',
        prefix: 'lucide',
        cursor: undefined,
        pageSize: '20',
      },
    })
    expectFetchCall(fetchMock, 1, {
      method: 'GET',
      pathname: '/api/content/icon-sets/custom/icons',
      query: {
        keyword: 'user',
        prefix: 'acme',
        cursor: 'acme:user-add',
        pageSize: '20',
      },
    })
  })

  it('creates, updates, and deletes custom icon sets', async () => {
    const updatedIconSet = { ...customIconSetResponse, name: 'Acme Updated' }
    const fetchMock = createFetchMock(
      jsonResponse(customIconSetResponse, { status: 201 }),
      jsonResponse(updatedIconSet),
      emptyResponse(),
    )
    useAuthStore().accessToken = 'access-token'

    await expect(
      createCustomIconSet({ prefix: 'acme', name: 'Acme Icons', description: null }),
    ).resolves.toEqual(customIconSetResponse)
    await expect(updateCustomIconSet('acme', { name: 'Acme Updated' })).resolves.toEqual(
      updatedIconSet,
    )
    await expect(deleteCustomIconSet('acme')).resolves.toBeUndefined()

    expectFetchCall(fetchMock, 0, {
      method: 'POST',
      pathname: '/api/content/icon-sets/custom',
    })
    expectJsonBody(fetchMock, 0, {
      prefix: 'acme',
      name: 'Acme Icons',
      description: null,
    })
    expectFetchCall(fetchMock, 1, {
      method: 'PATCH',
      pathname: '/api/content/icon-sets/custom/acme',
    })
    expectJsonBody(fetchMock, 1, { name: 'Acme Updated' })
    expectFetchCall(fetchMock, 2, {
      method: 'DELETE',
      pathname: '/api/content/icon-sets/custom/acme',
    })
  })

  it('uploads custom icons as multipart form data and parses partial results', async () => {
    const uploadResponse = {
      results: [
        { status: 'created', icon: customIconResponse },
        {
          status: 'skipped',
          name: 'existing',
          reason: 'duplicate',
        },
        { status: 'failed', message: 'SVG 无效' },
      ],
    }
    const fetchMock = createFetchMock(jsonResponse(uploadResponse))
    const files = [
      new File(['<svg />'], 'user-add.svg', { type: 'image/svg+xml' }),
      new File(['<svg />'], 'existing.svg', { type: 'image/svg+xml' }),
      new File(['broken'], 'bad.svg', { type: 'image/svg+xml' }),
    ]
    useAuthStore().accessToken = 'access-token'

    await expect(
      uploadCustomIcons('acme', {
        duplicateStrategy: 'replace',
        files,
        metadata: [{ keywords: ['User'] }, {}, {}],
      }),
    ).resolves.toEqual(uploadResponse)

    const call = expectFetchCall(fetchMock, 0, {
      method: 'POST',
      pathname: '/api/content/icon-sets/custom/acme/icons',
    })
    const form = call.init.body

    expect(form).toBeInstanceOf(FormData)
    expect((form as FormData).get('duplicateStrategy')).toBe('replace')
    expect((form as FormData).getAll('files')).toEqual(files)
    expect((form as FormData).get('metadata')).toBe(
      JSON.stringify([{ keywords: ['User'] }, {}, {}]),
    )
  })

  it('rejects upload responses that cannot be matched to the submitted files', async () => {
    createFetchMock(jsonResponse({ results: [] }))

    await expect(
      uploadCustomIcons('acme', {
        duplicateStrategy: 'skip',
        files: [new File(['<svg />'], 'logo.svg', { type: 'image/svg+xml' })],
      }),
    ).rejects.toThrow('上传结果数量与文件数不一致')
  })

  it('renames and deletes custom icons', async () => {
    const renamedIcon = {
      ...customIconResponse,
      icon: 'acme:account-add',
      name: 'account-add',
    }
    const fetchMock = createFetchMock(jsonResponse(renamedIcon), emptyResponse())
    useAuthStore().accessToken = 'access-token'

    await expect(
      updateCustomIcon('acme', 'user-add', { name: 'account-add', keywords: ['Account'] }),
    ).resolves.toEqual(renamedIcon)
    await expect(deleteCustomIcon('acme', 'account-add')).resolves.toBeUndefined()

    expectFetchCall(fetchMock, 0, {
      method: 'PATCH',
      pathname: '/api/content/icon-sets/custom/acme/icons/user-add',
    })
    expectJsonBody(fetchMock, 0, { name: 'account-add', keywords: ['Account'] })
    expectFetchCall(fetchMock, 1, {
      method: 'DELETE',
      pathname: '/api/content/icon-sets/custom/acme/icons/account-add',
    })
  })

  it('exports custom icon sets through authenticated fetch', async () => {
    const fetchMock = createFetchMock(
      new Response('{"prefix":"acme","icons":{}}', {
        headers: {
          'content-disposition': 'attachment; filename="acme.json"',
          'content-type': 'application/json',
        },
      }),
    )
    useAuthStore().accessToken = 'access-token'

    const result = await exportCustomIconSet('acme')
    const call = expectFetchCall(fetchMock, 0, {
      pathname: '/api/content/icon-sets/custom/acme/export',
    })

    expect(call.headers.get('authorization')).toBe('Bearer access-token')
    expect(result.filename).toBe('acme.json')
    expect(await result.blob.text()).toBe('{"prefix":"acme","icons":{}}')
  })

  it('returns export errors when response json contains message', async () => {
    createFetchMock(
      new Response(JSON.stringify({ message: '无权导出图标集' }), {
        status: 403,
      }),
    )
    useAuthStore().accessToken = 'access-token'

    const failedExport = exportCustomIconSet('acme')

    await expect(failedExport).rejects.toBeInstanceOf(ApiRequestError)
    await expect(failedExport).rejects.toMatchObject({
      status: 403,
      message: '无权导出图标集',
    })
  })
})
