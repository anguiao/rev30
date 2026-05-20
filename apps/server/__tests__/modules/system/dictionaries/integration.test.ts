import {
  DICTIONARY_STATUS_DISABLED,
  DICTIONARY_STATUS_ENABLED,
  type DictionaryDetail,
  type DictionaryListResponse,
  type DictionaryOptionsResponse,
} from '@rev30/shared'
import { eq } from 'drizzle-orm'
import type { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { systemDictionaryItems, systemDictionaryTypes } from '../../../../src/db/schema'
import { createDictionaryRoutes } from '../../../../src/modules/system/dictionaries/routes'
import { createProtectedSystemRouteTestApp, createSystemAccessFixture } from '../../../helpers/auth'
import { createTestDb } from '../../../helpers/db'

type ErrorResponse = {
  message: string
  field?: string
}

type TestAppOptions = {
  admin?: boolean
  accessCodes?: string[]
  usernamePrefix?: string
}

async function createTestApp(
  database: Awaited<ReturnType<typeof createTestDb>>,
  options: TestAppOptions = {},
) {
  const fixture = await createSystemAccessFixture(database, {
    admin: options.admin ?? true,
    usernamePrefix: options.usernamePrefix ?? 'dictionary-routes-admin',
    ...(options.accessCodes ? { accessCodes: options.accessCodes } : {}),
  })

  return createProtectedSystemRouteTestApp(
    database,
    '/api/system/dictionaries',
    createDictionaryRoutes(database),
    fixture.authHeaders,
  )
}

async function createDictionary(
  app: Hono,
  body: {
    code: string
    name: string
    description?: string | null
    status?: 0 | 1
    sortOrder?: number
    items?: Array<{
      label: string
      value: string
      description?: string | null
      status?: 0 | 1
      sortOrder?: number
    }>
  },
) {
  const response = await app.request('/api/system/dictionaries', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })

  return { body: (await response.json()) as DictionaryDetail, response }
}

describe('dictionary routes', () => {
  it('supports create/get/list/put/delete lifecycle for dictionaries', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const { body: created, response: createResponse } = await createDictionary(app, {
      code: 'gender',
      name: '性别',
      description: '性别字典',
      sortOrder: 10,
      items: [
        { label: '男', value: 'male', sortOrder: 10 },
        { label: '女', value: 'female', status: DICTIONARY_STATUS_DISABLED, sortOrder: 20 },
      ],
    })

    expect(createResponse.status).toBe(201)
    expect(created).toMatchObject({
      code: 'gender',
      name: '性别',
      description: '性别字典',
      status: DICTIONARY_STATUS_ENABLED,
      sortOrder: 10,
    })
    expect(created.items).toHaveLength(2)

    const detailResponse = await app.request(`/api/system/dictionaries/${created.id}`)
    const detail = (await detailResponse.json()) as DictionaryDetail
    expect(detailResponse.status).toBe(200)
    expect(detail.items.map((item) => item.value)).toEqual(['male', 'female'])

    const listResponse = await app.request('/api/system/dictionaries?page=1&pageSize=10')
    const list = (await listResponse.json()) as DictionaryListResponse
    expect(listResponse.status).toBe(200)
    const listItem = list.list.find((item) => item.id === created.id)
    expect(listItem).toMatchObject({
      code: 'gender',
      itemCount: 2,
    })

    const maleItem = detail.items.find((item) => item.value === 'male')
    expect(maleItem).toBeDefined()

    const updateResponse = await app.request(`/api/system/dictionaries/${created.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        code: 'gender',
        name: '性别（更新）',
        description: null,
        status: DICTIONARY_STATUS_DISABLED,
        sortOrder: 99,
        items: [
          {
            id: maleItem?.id,
            label: '男（更新）',
            value: 'male',
            description: 'updated',
            status: DICTIONARY_STATUS_DISABLED,
            sortOrder: 30,
          },
          {
            label: '未知',
            value: 'unknown',
            description: null,
            status: DICTIONARY_STATUS_ENABLED,
            sortOrder: 40,
          },
        ],
      }),
      headers: { 'content-type': 'application/json' },
    })
    const updated = (await updateResponse.json()) as DictionaryDetail
    expect(updateResponse.status).toBe(200)
    expect(updated).toMatchObject({
      id: created.id,
      code: 'gender',
      name: '性别（更新）',
      description: null,
      status: DICTIONARY_STATUS_DISABLED,
      sortOrder: 99,
    })
    expect(updated.items).toHaveLength(2)
    expect(updated.items.map((item) => item.value).sort()).toEqual(['male', 'unknown'])

    const deleteResponse = await app.request(`/api/system/dictionaries/${created.id}`, {
      method: 'DELETE',
    })
    expect(deleteResponse.status).toBe(204)

    const [deletedType] = await database
      .select()
      .from(systemDictionaryTypes)
      .where(eq(systemDictionaryTypes.id, created.id))
    expect(deletedType?.deletedAt).toEqual(expect.any(Date))
  })

  it('allows authenticated users without list access to query options', async () => {
    const database = await createTestDb()
    const adminApp = await createTestApp(database, {
      admin: true,
      usernamePrefix: 'dictionary-options-admin',
    })
    const normalUserApp = await createTestApp(database, {
      admin: false,
      usernamePrefix: 'dictionary-options-user',
    })
    await createDictionary(adminApp, {
      code: 'gender',
      name: '性别',
      status: DICTIONARY_STATUS_ENABLED,
      items: [
        { label: '男', value: 'male', status: DICTIONARY_STATUS_ENABLED, sortOrder: 10 },
        { label: '女', value: 'female', status: DICTIONARY_STATUS_ENABLED, sortOrder: 20 },
        { label: '隐藏', value: 'hidden', status: DICTIONARY_STATUS_DISABLED, sortOrder: 5 },
      ],
    })
    await createDictionary(adminApp, {
      code: 'disabled_type',
      name: '禁用类型',
      status: DICTIONARY_STATUS_DISABLED,
      items: [{ label: '禁用项', value: 'disabled_item', status: DICTIONARY_STATUS_ENABLED }],
    })
    await createDictionary(adminApp, {
      code: 'empty_type',
      name: '空类型',
      status: DICTIONARY_STATUS_ENABLED,
      items: [],
    })

    const optionsResponse = await normalUserApp.request(
      '/api/system/dictionaries/options?codes=gender,missing,disabled_type,empty_type',
    )
    expect(optionsResponse.status).toBe(200)
    expect((await optionsResponse.json()) as DictionaryOptionsResponse).toEqual({
      gender: [
        { label: '男', value: 'male' },
        { label: '女', value: 'female' },
      ],
      missing: [],
      disabled_type: [],
      empty_type: [],
    })

    const unauthenticatedApp = createProtectedSystemRouteTestApp(
      database,
      '/api/system/dictionaries',
      createDictionaryRoutes(database),
    )
    const unauthorizedResponse = await unauthenticatedApp.request(
      '/api/system/dictionaries/options?codes=gender',
    )
    expect(unauthorizedResponse.status).toBe(401)
  })

  it('counts only active items in list itemCount and keeps disabled items in detail', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const { body: created } = await createDictionary(app, {
      code: 'status',
      name: '状态',
      items: [
        { label: '启用', value: 'enabled' },
        { label: '禁用', value: 'disabled', status: DICTIONARY_STATUS_DISABLED },
      ],
    })
    const removedItemId = created.items.find((item) => item.value === 'enabled')?.id
    expect(removedItemId).toBeDefined()

    const putResponse = await app.request(`/api/system/dictionaries/${created.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        code: 'status',
        name: '状态',
        description: null,
        status: DICTIONARY_STATUS_ENABLED,
        sortOrder: 0,
        items: created.items
          .filter((item) => item.value !== 'enabled')
          .map((item) => ({
            id: item.id,
            label: item.label,
            value: item.value,
            description: item.description,
            status: item.status,
            sortOrder: item.sortOrder,
          })),
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(putResponse.status).toBe(200)

    const listResponse = await app.request('/api/system/dictionaries?page=1&pageSize=10')
    const list = (await listResponse.json()) as DictionaryListResponse
    const listItem = list.list.find((item) => item.id === created.id)
    expect(listItem?.itemCount).toBe(1)

    const detailResponse = await app.request(`/api/system/dictionaries/${created.id}`)
    const detail = (await detailResponse.json()) as DictionaryDetail
    expect(detailResponse.status).toBe(200)
    expect(detail.items).toHaveLength(1)
    expect(detail.items[0]?.status).toBe(DICTIONARY_STATUS_DISABLED)

    const [removedItem] = await database
      .select()
      .from(systemDictionaryItems)
      .where(eq(systemDictionaryItems.id, removedItemId!))
    expect(removedItem?.deletedAt).toEqual(expect.any(Date))
  })

  it('allows reusing deleted item value in same put payload', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const { body: created } = await createDictionary(app, {
      code: 'reusable',
      name: '可复用',
      items: [
        { label: '旧值', value: 'legacy' },
        { label: '保留', value: 'keep' },
      ],
    })
    const keepItem = created.items.find((item) => item.value === 'keep')
    expect(keepItem).toBeDefined()

    const response = await app.request(`/api/system/dictionaries/${created.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        code: 'reusable',
        name: '可复用',
        description: null,
        status: DICTIONARY_STATUS_ENABLED,
        sortOrder: 0,
        items: [
          {
            id: keepItem?.id,
            label: '保留',
            value: 'keep',
            description: null,
            status: DICTIONARY_STATUS_ENABLED,
            sortOrder: 0,
          },
          {
            label: '新值',
            value: 'legacy',
            description: null,
            status: DICTIONARY_STATUS_ENABLED,
            sortOrder: 1,
          },
        ],
      }),
      headers: { 'content-type': 'application/json' },
    })
    const body = (await response.json()) as DictionaryDetail
    expect(response.status).toBe(200)
    expect(body.items.map((item) => item.value).sort()).toEqual(['keep', 'legacy'])
  })

  it('rejects updating dictionary with item id from another dictionary', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const { body: first } = await createDictionary(app, {
      code: 'first',
      name: '第一个',
      items: [{ label: 'A', value: 'a' }],
    })
    const { body: second } = await createDictionary(app, {
      code: 'second',
      name: '第二个',
      items: [{ label: 'B', value: 'b' }],
    })
    const foreignItemId = second.items[0]?.id
    expect(foreignItemId).toBeDefined()
    const beforeItems = first.items.map((item) => ({
      id: item.id,
      label: item.label,
      value: item.value,
      description: item.description,
      status: item.status,
      sortOrder: item.sortOrder,
    }))

    const response = await app.request(`/api/system/dictionaries/${first.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        code: 'first-updated',
        name: '第一个（更新）',
        description: null,
        status: DICTIONARY_STATUS_ENABLED,
        sortOrder: 0,
        items: [
          {
            id: foreignItemId,
            label: 'A',
            value: 'a',
            description: null,
            status: DICTIONARY_STATUS_ENABLED,
            sortOrder: 0,
          },
        ],
      }),
      headers: { 'content-type': 'application/json' },
    })

    expect(response.status).toBe(400)
    expect((await response.json()) as ErrorResponse).toEqual({ message: '字典项无效' })

    const detailResponse = await app.request(`/api/system/dictionaries/${first.id}`)
    const detailBody = (await detailResponse.json()) as DictionaryDetail
    expect(detailResponse.status).toBe(200)
    expect(detailBody.code).toBe('first')
    expect(detailBody.name).toBe('第一个')
    expect(
      detailBody.items.map((item) => ({
        id: item.id,
        label: item.label,
        value: item.value,
        description: item.description,
        status: item.status,
        sortOrder: item.sortOrder,
      })),
    ).toEqual(beforeItems)
  })

  it('returns duplicate active code conflict and allows reusing soft-deleted code', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const { body: first } = await createDictionary(app, {
      code: 'dup-code',
      name: '重复编码',
      items: [{ label: 'A', value: 'a' }],
    })

    const duplicateResponse = await app.request('/api/system/dictionaries', {
      method: 'POST',
      body: JSON.stringify({
        code: 'dup-code',
        name: '重复编码2',
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(duplicateResponse.status).toBe(409)
    expect((await duplicateResponse.json()) as ErrorResponse).toEqual({
      field: 'code',
      message: '字典编码已存在',
    })

    const deleteResponse = await app.request(`/api/system/dictionaries/${first.id}`, {
      method: 'DELETE',
    })
    expect(deleteResponse.status).toBe(204)

    const recreate = await createDictionary(app, {
      code: 'dup-code',
      name: '重复编码3',
    })
    expect(recreate.response.status).toBe(201)
    expect(recreate.body.id).not.toBe(first.id)
  })

  it('allows moving retained item values when final payload is unique', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const { body: created } = await createDictionary(app, {
      code: 'item-value-conflict',
      name: '字典项值冲突',
      items: [
        { label: 'A', value: 'a' },
        { label: 'B', value: 'b' },
      ],
    })
    const itemA = created.items.find((item) => item.value === 'a')
    const itemB = created.items.find((item) => item.value === 'b')
    expect(itemA).toBeDefined()
    expect(itemB).toBeDefined()

    const response = await app.request(`/api/system/dictionaries/${created.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        code: 'item-value-conflict-updated',
        name: '字典项值冲突（更新）',
        description: null,
        status: DICTIONARY_STATUS_ENABLED,
        sortOrder: 99,
        items: [
          {
            id: itemA?.id,
            label: 'A',
            value: 'b',
            description: null,
            status: DICTIONARY_STATUS_ENABLED,
            sortOrder: 0,
          },
          {
            id: itemB?.id,
            label: 'B',
            value: 'c',
            description: null,
            status: DICTIONARY_STATUS_ENABLED,
            sortOrder: 1,
          },
        ],
      }),
      headers: { 'content-type': 'application/json' },
    })
    const body = (await response.json()) as DictionaryDetail

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      id: created.id,
      code: 'item-value-conflict-updated',
      name: '字典项值冲突（更新）',
      description: null,
      status: DICTIONARY_STATUS_ENABLED,
      sortOrder: 99,
    })
    expect(body.items.map((item) => item.value).sort()).toEqual(['b', 'c'])
    expect(body.items.every((item) => !item.value.startsWith('__dictionary_tmp_'))).toBe(true)

    const detailResponse = await app.request(`/api/system/dictionaries/${created.id}`)
    const detailBody = (await detailResponse.json()) as DictionaryDetail
    expect(detailResponse.status).toBe(200)
    expect(detailBody.code).toBe('item-value-conflict-updated')
    expect(detailBody.name).toBe('字典项值冲突（更新）')
    expect(detailBody.sortOrder).toBe(99)
    expect(detailBody.items.map((item) => item.value).sort()).toEqual(['b', 'c'])
    expect(detailBody.items.every((item) => !item.value.startsWith('__dictionary_tmp_'))).toBe(true)

    const [typeRow] = await database
      .select()
      .from(systemDictionaryTypes)
      .where(eq(systemDictionaryTypes.id, created.id))
    expect(typeRow).toBeDefined()
    expect(typeRow?.code).toBe('item-value-conflict-updated')
    expect(typeRow?.name).toBe('字典项值冲突（更新）')
    expect(typeRow?.sortOrder).toBe(99)

    const itemRows = await database
      .select()
      .from(systemDictionaryItems)
      .where(eq(systemDictionaryItems.typeId, created.id))
    expect(itemRows).toHaveLength(2)
    expect(itemRows.every((item) => item.deletedAt === null)).toBe(true)
    expect(itemRows.map((item) => item.value).sort()).toEqual(['b', 'c'])
    expect(itemRows.every((item) => !item.value.startsWith('__dictionary_tmp_'))).toBe(true)
  })

  it('allows reusing soft-deleted old value in same dictionary', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const { body: created } = await createDictionary(app, {
      code: 'item-value',
      name: '字典项值',
      items: [
        { label: '旧值', value: 'legacy' },
        { label: '保留', value: 'keep' },
      ],
    })
    const keepItem = created.items.find((item) => item.value === 'keep')
    expect(keepItem).toBeDefined()

    const duplicateCreate = await app.request('/api/system/dictionaries', {
      method: 'POST',
      body: JSON.stringify({
        code: 'item-value-2',
        name: '字典项值2',
        items: [
          { label: 'A', value: 'same' },
          { label: 'B', value: 'same' },
        ],
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(duplicateCreate.status).toBe(400)
    expect((await duplicateCreate.json()) as ErrorResponse).toEqual({ message: '请求体无效' })

    const duplicatePut = await app.request(`/api/system/dictionaries/${created.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        code: 'item-value',
        name: '字典项值',
        description: null,
        status: DICTIONARY_STATUS_ENABLED,
        sortOrder: 0,
        items: [
          {
            id: keepItem?.id,
            label: '保留',
            value: 'keep',
            description: null,
            status: DICTIONARY_STATUS_ENABLED,
            sortOrder: 0,
          },
          {
            label: '重复',
            value: 'keep',
            description: null,
            status: DICTIONARY_STATUS_ENABLED,
            sortOrder: 1,
          },
        ],
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(duplicatePut.status).toBe(400)
    expect((await duplicatePut.json()) as ErrorResponse).toEqual({ message: '请求体无效' })

    const reusablePut = await app.request(`/api/system/dictionaries/${created.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        code: 'item-value',
        name: '字典项值',
        description: null,
        status: DICTIONARY_STATUS_ENABLED,
        sortOrder: 0,
        items: [
          {
            id: keepItem?.id,
            label: '保留',
            value: 'keep',
            description: null,
            status: DICTIONARY_STATUS_ENABLED,
            sortOrder: 0,
          },
          {
            label: '复用旧值',
            value: 'legacy',
            description: null,
            status: DICTIONARY_STATUS_ENABLED,
            sortOrder: 1,
          },
        ],
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(reusablePut.status).toBe(200)
  })

  it('cascades soft delete from dictionary type to its undeleted items', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const { body: created } = await createDictionary(app, {
      code: 'cascade-delete',
      name: '级联删除',
      items: [
        { label: 'A', value: 'a' },
        { label: 'B', value: 'b' },
      ],
    })

    const deleteResponse = await app.request(`/api/system/dictionaries/${created.id}`, {
      method: 'DELETE',
    })
    expect(deleteResponse.status).toBe(204)

    const [typeRow] = await database
      .select()
      .from(systemDictionaryTypes)
      .where(eq(systemDictionaryTypes.id, created.id))
    expect(typeRow?.deletedAt).toEqual(expect.any(Date))

    const itemRows = await database
      .select()
      .from(systemDictionaryItems)
      .where(eq(systemDictionaryItems.typeId, created.id))
    expect(itemRows).toHaveLength(2)
    expect(itemRows.every((item) => item.deletedAt instanceof Date)).toBe(true)
  })
})
