import { beforeEach, describe, expect, it } from 'vitest'
import {
  DICTIONARY_STATUS_ENABLED,
  type DictionaryCreateInput,
  type DictionaryUpdateInput,
} from '@rev30/contracts'
import {
  listDictionaries,
  getDictionary,
  createDictionary,
  updateDictionary,
  deleteDictionary,
  getDictionaryOptions,
} from '../../../src/features/dictionaries/requests'
import { useAuthStore } from '../../../src/stores/auth'
import {
  createFetchMock,
  emptyResponse,
  expectFetchCall,
  expectJsonBody,
  jsonResponse,
} from '../../helpers/fetch'
import { createTestPinia } from '../../helpers/pinia'

const dictionaryId = '11111111-1111-4111-8111-111111111111'

const dictionaryItemId = '11111111-1111-4111-8111-111111111112'

const dictionaryListResponse = {
  list: [
    {
      id: dictionaryId,
      code: 'user_status',
      name: '用户状态',
      description: '用户状态字典',
      status: DICTIONARY_STATUS_ENABLED,
      sortOrder: 1,
      itemCount: 2,
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
    },
  ],
  total: 1,
  page: 1,
  pageSize: 20,
}

const dictionaryDetailResponse = {
  id: dictionaryId,
  code: 'user_status',
  name: '用户状态',
  description: '用户状态字典',
  status: DICTIONARY_STATUS_ENABLED,
  sortOrder: 1,
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
  items: [
    {
      id: dictionaryItemId,
      typeId: dictionaryId,
      label: '启用',
      value: 'enabled',
      description: null,
      status: DICTIONARY_STATUS_ENABLED,
      sortOrder: 0,
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
    },
  ],
}

const dictionaryCreateInput: DictionaryCreateInput = {
  code: 'region',
  name: '地区',
  description: null,
  status: 1,
  sortOrder: 0,
  items: [],
}

const dictionaryCreateResponse = {
  ...dictionaryDetailResponse,
  id: '11111111-1111-4111-8111-111111111113',
  name: '地区',
  code: 'region',
}

const dictionaryUpdateInput: DictionaryUpdateInput = {
  code: 'user_status',
  name: '地区字典',
  description: null,
  status: 1,
  sortOrder: 1,
  items: [
    {
      id: dictionaryItemId,
      label: '启用',
      value: 'enabled',
      description: null,
      status: 1,
      sortOrder: 0,
    },
  ],
}

const dictionaryUpdateResponse = {
  ...dictionaryCreateResponse,
  name: '地区字典',
}

const dictionaryOptionsResponse = {
  user_status: [{ value: 'enabled', label: '启用' }],
  region: [{ value: 'north', label: '北区' }],
}

beforeEach(() => {
  createTestPinia()
  useAuthStore().accessToken = 'access-token'
})

describe('dictionaries request helpers', () => {
  it('parses dictionary list responses and query params', async () => {
    const fetchMock = createFetchMock(jsonResponse(dictionaryListResponse))

    const listResult = await listDictionaries({
      page: 1,
      pageSize: 20,
      keyword: '状态',
      status: DICTIONARY_STATUS_ENABLED,
    })

    expect(listResult.total).toBe(1)
    expect(listResult.list[0]?.code).toBe('user_status')
    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/system/dictionaries',
      query: {
        page: '1',
        pageSize: '20',
        keyword: '状态',
        status: '1',
      },
    })
  })

  it('parses a dictionary detail response', async () => {
    const fetchMock = createFetchMock(jsonResponse(dictionaryDetailResponse))

    await expect(getDictionary(dictionaryId)).resolves.toEqual(dictionaryDetailResponse)

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: `/api/system/dictionaries/${dictionaryId}`,
    })
  })

  it('sends dictionary create input and parses the created dictionary', async () => {
    const fetchMock = createFetchMock(jsonResponse(dictionaryCreateResponse))

    await expect(createDictionary(dictionaryCreateInput)).resolves.toEqual(dictionaryCreateResponse)

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'POST',
      pathname: '/api/system/dictionaries',
    })
    expectJsonBody(fetchMock, 0, dictionaryCreateInput)
  })

  it('sends dictionary update input and parses the updated dictionary', async () => {
    const fetchMock = createFetchMock(jsonResponse(dictionaryUpdateResponse))

    await expect(updateDictionary(dictionaryId, dictionaryUpdateInput)).resolves.toEqual(
      dictionaryUpdateResponse,
    )

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'PUT',
      pathname: `/api/system/dictionaries/${dictionaryId}`,
    })
    expectJsonBody(fetchMock, 0, dictionaryUpdateInput)
  })

  it('deletes a dictionary with an empty response', async () => {
    const fetchMock = createFetchMock(emptyResponse())

    await expect(deleteDictionary(dictionaryId)).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'DELETE',
      pathname: `/api/system/dictionaries/${dictionaryId}`,
    })
  })

  it('parses dictionary options and encodes requested codes', async () => {
    const fetchMock = createFetchMock(jsonResponse(dictionaryOptionsResponse))

    await expect(getDictionaryOptions(['user_status', 'region'])).resolves.toEqual(
      dictionaryOptionsResponse,
    )

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/system/dictionaries/options',
      query: {
        codes: 'user_status,region',
      },
    })
  })
})
