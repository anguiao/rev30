import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { CONFIG_VALUE_TYPE_NUMBER, type Config, type ConfigListResponse } from '@rev30/contracts'
import { systemConfigOverrides } from '../../../../src/db/schema'
import { configRegistry } from '../../../../src/modules/system/configs/registry'
import { createConfigRoutes } from '../../../../src/modules/system/configs/routes'
import { createProtectedSystemRouteTestApp, createSystemAccessFixture } from '../../../helpers/auth'
import { createTestDb } from '../../../helpers/db'

type ErrorResponse = {
  message: string
  field?: string
}

const configKey = 'auth.loginFailureMaxAttempts'

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

async function updateConfig(app: Hono, key: string, customValue: string | null) {
  const response = await app.request(`/api/system/configs/${key}`, {
    method: 'PUT',
    body: JSON.stringify({ customValue }),
    headers: { 'content-type': 'application/json' },
  })

  return { body: (await response.json()) as Config, response }
}

describe('config routes', () => {
  it('lists every registry config without requiring override rows', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)

    const response = await app.request('/api/system/configs')
    const body = (await response.json()) as ConfigListResponse

    expect(response.status).toBe(200)
    expect(body).toHaveLength(configRegistry.length)
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: configKey,
          valueType: CONFIG_VALUE_TYPE_NUMBER,
          defaultValue: '5',
          customValue: null,
          value: '5',
        }),
      ]),
    )
  })

  it('gets a single registry config by key', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)

    const response = await app.request(`/api/system/configs/${configKey}`)
    const body = (await response.json()) as Config

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      key: configKey,
      name: '登录失败最大次数（次）',
      customValue: null,
      value: '5',
    })
  })

  it('sets and updates a custom override value', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)

    const { body: created, response: createResponse } = await updateConfig(app, configKey, '8')
    expect(createResponse.status).toBe(200)
    expect(created).toMatchObject({
      key: configKey,
      customValue: '8',
      value: '8',
    })

    const [createdRow] = await database
      .select()
      .from(systemConfigOverrides)
      .where(eq(systemConfigOverrides.key, configKey))
    expect(createdRow?.value).toBe('8')

    const { body: updated, response: updateResponse } = await updateConfig(app, configKey, '9')
    expect(updateResponse.status).toBe(200)
    expect(updated).toMatchObject({
      key: configKey,
      customValue: '9',
      value: '9',
    })

    const rows = await database
      .select()
      .from(systemConfigOverrides)
      .where(eq(systemConfigOverrides.key, configKey))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.value).toBe('9')
  })

  it('clears a custom value by submitting null', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)

    await updateConfig(app, configKey, '8')
    const { body, response } = await updateConfig(app, configKey, null)

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      key: configKey,
      customValue: null,
      value: '5',
    })

    const rows = await database
      .select()
      .from(systemConfigOverrides)
      .where(eq(systemConfigOverrides.key, configKey))
    expect(rows).toHaveLength(0)
  })

  it('returns not found for unregistered config keys', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)

    const detailResponse = await app.request('/api/system/configs/auth.unknown')
    expect(detailResponse.status).toBe(404)
    expect((await detailResponse.json()) as ErrorResponse).toEqual({ message: '配置不存在' })

    const updateResponse = await app.request('/api/system/configs/auth.unknown', {
      method: 'PUT',
      body: JSON.stringify({ customValue: '1' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(updateResponse.status).toBe(404)
    expect((await updateResponse.json()) as ErrorResponse).toEqual({ message: '配置不存在' })
  })

  it('returns field error for invalid custom values', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)

    const response = await app.request(`/api/system/configs/${configKey}`, {
      method: 'PUT',
      body: JSON.stringify({ customValue: '100' }),
      headers: { 'content-type': 'application/json' },
    })

    expect(response.status).toBe(400)
    expect((await response.json()) as ErrorResponse).toEqual({
      field: 'customValue',
      message: '配置值必须是 1 到 20 之间的整数',
    })
  })
})
