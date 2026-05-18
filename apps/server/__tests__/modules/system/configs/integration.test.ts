import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import {
  CONFIG_STATUS_DISABLED,
  CONFIG_STATUS_ENABLED,
  CONFIG_VALUE_TYPE_NUMBER,
  CONFIG_VALUE_TYPE_STRING,
  type Config,
  type ConfigListResponse,
} from '@rev30/shared'
import { systemConfigs } from '../../../../src/db/schema'
import { createProtectedSystemRouteTestApp, createSystemAccessFixture } from '../../../helpers/auth'
import { createTestDb } from '../../../helpers/db'
import { createConfigRoutes } from '../../../../src/modules/system/configs/routes'

type ErrorResponse = {
  message: string
  field?: string
}

async function createTestApp(
  database: Awaited<ReturnType<typeof createTestDb>>,
  authHeaders?: Record<string, string>,
) {
  const headers =
    authHeaders ??
    (
      await createSystemAccessFixture(database, {
        admin: true,
        usernamePrefix: 'config-routes-admin',
      })
    ).authHeaders

  return createProtectedSystemRouteTestApp(
    database,
    '/api/system/configs',
    createConfigRoutes(database),
    headers,
  )
}

async function createConfig(
  app: Hono,
  body: {
    groupCode: string
    key: string
    name: string
    valueType: 'string' | 'number' | 'boolean' | 'json'
    value: string
    description?: string | null
    status?: 0 | 1
    sortOrder?: number
  },
) {
  const response = await app.request('/api/system/configs', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })

  return { body: (await response.json()) as Config, response }
}

describe('config routes', () => {
  it('supports create/get/list/update/delete lifecycle for configs', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)

    const { body: created, response: createResponse } = await createConfig(app, {
      groupCode: 'site',
      key: 'site.title',
      name: '站点名称',
      valueType: CONFIG_VALUE_TYPE_STRING,
      value: 'Rev30',
      description: '后台显示名称',
      sortOrder: 10,
    })

    expect(createResponse.status).toBe(201)
    expect(created).toMatchObject({
      groupCode: 'site',
      key: 'site.title',
      name: '站点名称',
      valueType: CONFIG_VALUE_TYPE_STRING,
      value: 'Rev30',
      description: '后台显示名称',
      status: CONFIG_STATUS_ENABLED,
      sortOrder: 10,
    })
    expect(created.createdAt).toEqual(expect.any(String))
    expect(created.updatedAt).toEqual(expect.any(String))

    const detailResponse = await app.request(`/api/system/configs/${created.id}`)
    const detailBody = (await detailResponse.json()) as Config
    expect(detailResponse.status).toBe(200)
    expect(detailBody).toMatchObject({
      id: created.id,
      key: 'site.title',
      value: 'Rev30',
      sortOrder: 10,
    })

    const listResponse = await app.request('/api/system/configs?page=1&pageSize=10')
    const listBody = (await listResponse.json()) as ConfigListResponse
    expect(listResponse.status).toBe(200)
    expect(listBody.total).toBeGreaterThanOrEqual(1)
    expect(listBody.list).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: created.id, key: 'site.title' })]),
    )

    const updateResponse = await app.request(`/api/system/configs/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: '站点标题',
        status: CONFIG_STATUS_DISABLED,
      }),
      headers: { 'content-type': 'application/json' },
    })
    const updateBody = (await updateResponse.json()) as Config
    expect(updateResponse.status).toBe(200)
    expect(updateBody).toMatchObject({
      id: created.id,
      name: '站点标题',
      status: CONFIG_STATUS_DISABLED,
    })

    const deleteResponse = await app.request(`/api/system/configs/${created.id}`, {
      method: 'DELETE',
    })
    expect(deleteResponse.status).toBe(204)

    const [deleted] = await database
      .select()
      .from(systemConfigs)
      .where(eq(systemConfigs.id, created.id))
    expect(deleted?.deletedAt).toEqual(expect.any(Date))
  })

  it('returns list without sortOrder and sorts by groupCode, sortOrder, key', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const now = new Date('2026-05-18T00:00:00.000Z')

    await database.insert(systemConfigs).values([
      {
        id: randomUUID(),
        groupCode: 'z-group',
        key: 'z-group.b',
        name: 'ZB',
        valueType: CONFIG_VALUE_TYPE_STRING,
        value: '1',
        sortOrder: 2,
        status: CONFIG_STATUS_ENABLED,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: randomUUID(),
        groupCode: 'a-group',
        key: 'a-group.b',
        name: 'AB',
        valueType: CONFIG_VALUE_TYPE_STRING,
        value: '1',
        sortOrder: 2,
        status: CONFIG_STATUS_ENABLED,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: randomUUID(),
        groupCode: 'a-group',
        key: 'a-group.a',
        name: 'AA',
        valueType: CONFIG_VALUE_TYPE_STRING,
        value: '1',
        sortOrder: 2,
        status: CONFIG_STATUS_ENABLED,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: randomUUID(),
        groupCode: 'a-group',
        key: 'a-group.z',
        name: 'AZ',
        valueType: CONFIG_VALUE_TYPE_STRING,
        value: '1',
        sortOrder: 1,
        status: CONFIG_STATUS_ENABLED,
        createdAt: now,
        updatedAt: now,
      },
    ])

    const response = await app.request('/api/system/configs?page=1&pageSize=10')
    const body = (await response.json()) as ConfigListResponse

    expect(response.status).toBe(200)
    expect(body.list[0]!.key).toBe('a-group.z')
    expect(body.list[1]!.key).toBe('a-group.a')
    expect(body.list[2]!.key).toBe('a-group.b')
    expect(body.list[3]!.key).toBe('z-group.b')
    expect(body.list[0]).not.toHaveProperty('sortOrder')
  })

  it('returns conflict error when creating duplicated active key', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)

    await createConfig(app, {
      groupCode: 'site',
      key: 'site.title',
      name: '站点名称',
      valueType: CONFIG_VALUE_TYPE_STRING,
      value: 'Rev30',
    })

    const duplicateResponse = await app.request('/api/system/configs', {
      method: 'POST',
      body: JSON.stringify({
        groupCode: 'site',
        key: 'site.title',
        name: '站点名称2',
        valueType: CONFIG_VALUE_TYPE_STRING,
        value: 'Rev30 2',
      }),
      headers: { 'content-type': 'application/json' },
    })

    expect(duplicateResponse.status).toBe(409)
    expect((await duplicateResponse.json()) as ErrorResponse).toEqual({
      field: 'key',
      message: '配置键已存在',
    })
  })

  it('validates merged existing value when only updating valueType', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const { body: created } = await createConfig(app, {
      groupCode: 'site',
      key: 'site.retry',
      name: '重试次数',
      valueType: CONFIG_VALUE_TYPE_STRING,
      value: 'abc',
    })

    const response = await app.request(`/api/system/configs/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ valueType: CONFIG_VALUE_TYPE_NUMBER }),
      headers: { 'content-type': 'application/json' },
    })

    expect(response.status).toBe(400)
    expect((await response.json()) as ErrorResponse).toEqual({
      field: 'value',
      message: '配置值必须是有限数字',
    })
  })

  it('allows recreating the same key after soft delete', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const { body: first } = await createConfig(app, {
      groupCode: 'site',
      key: 'site.theme',
      name: '主题',
      valueType: CONFIG_VALUE_TYPE_STRING,
      value: 'light',
    })

    const deleteResponse = await app.request(`/api/system/configs/${first.id}`, {
      method: 'DELETE',
    })
    expect(deleteResponse.status).toBe(204)

    const { body: recreated, response: recreatedResponse } = await createConfig(app, {
      groupCode: 'site',
      key: 'site.theme',
      name: '主题（新）',
      valueType: CONFIG_VALUE_TYPE_STRING,
      value: 'dark',
    })

    expect(recreatedResponse.status).toBe(201)
    expect(recreated.id).not.toBe(first.id)
    expect(recreated.key).toBe('site.theme')
  })

  it('returns not-found errors for missing detail and delete', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const id = randomUUID()

    const detailResponse = await app.request(`/api/system/configs/${id}`)
    expect(detailResponse.status).toBe(404)
    expect((await detailResponse.json()) as ErrorResponse).toEqual({ message: '配置不存在' })

    const deleteResponse = await app.request(`/api/system/configs/${id}`, {
      method: 'DELETE',
    })
    expect(deleteResponse.status).toBe(404)
    expect((await deleteResponse.json()) as ErrorResponse).toEqual({ message: '配置不存在' })
  })
})
