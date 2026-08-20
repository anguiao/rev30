import { randomUUID } from 'node:crypto'
import {
  operationLogDetailSchema,
  operationLogListResponseSchema,
  type OperationLogListItem,
} from '@rev30/contracts'
import { describe, expect } from 'vitest'
import { sql } from 'drizzle-orm'
import { createApp } from '../../../../src/app'
import { opsOperationLogs } from '../../../../src/db/schema'
import type { OperationAuditEvent } from '../../../../src/modules/ops/operation-logs/types'
import { dbTest, type TestDatabase } from '../../../fixtures/database'
import { createSystemAccessFixture } from '../../../helpers/auth'

const actorUserId = '11111111-1111-4111-8111-111111111111'
const actorSessionId = '22222222-2222-4222-8222-222222222222'
const sharedTime = new Date('2026-08-19T10:00:00.000Z')

function operationLog(
  overrides: Partial<typeof opsOperationLogs.$inferInsert> = {},
): typeof opsOperationLogs.$inferInsert {
  return {
    id: randomUUID(),
    actorUserId,
    actorUsername: 'Alice.Operator',
    actorNickname: 'Operations Hero',
    actorIsAdmin: true,
    actorSessionId,
    module: 'system',
    action: 'system:user:update',
    targetType: 'user',
    targetKey: 'account-key',
    targetLabel: 'Target Display',
    result: 'success',
    httpStatus: 200,
    durationMs: 12,
    requestId: randomUUID(),
    clientIp: '203.0.113.8',
    clientIpSource: 'x-forwarded-for',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    createdAt: sharedTime,
    ...overrides,
  }
}

function createAuditSink(events: OperationAuditEvent[]) {
  return {
    enqueue(event: OperationAuditEvent) {
      events.push(event)
    },
  }
}

async function seedLogs(database: TestDatabase) {
  const newestId = 'ffffffff-ffff-4fff-bfff-ffffffffffff'
  const middleId = 'eeeeeeee-eeee-4eee-beee-eeeeeeeeeeee'
  const oldestId = 'dddddddd-dddd-4ddd-bddd-dddddddddddd'
  const failureRequestId = '33333333-3333-4333-8333-333333333333'

  await database.insert(opsOperationLogs).values([
    operationLog({
      id: oldestId,
      actorUsername: actorSessionId,
      actorNickname: 'Alice.Operator',
      createdAt: new Date('2026-08-19T09:00:00.000Z'),
    }),
    operationLog({
      id: middleId,
      actorSessionId: '44444444-4444-4444-8444-444444444444',
      targetKey: 'other-key',
      clientIp: '198.51.100.5',
    }),
    operationLog({
      id: newestId,
      actorUsername: 'Different User',
      actorNickname: 'Alice Nickname Match',
      module: 'content',
      action: 'content:announcement:delete',
      targetType: 'announcement',
      targetKey: 'other-target',
      targetLabel: 'Account Label Match',
      result: 'failure',
      httpStatus: 409,
      requestId: failureRequestId,
    }),
  ])

  return { failureRequestId, middleId, newestId, oldestId }
}

describe('operation log query API', () => {
  dbTest('enforces permission and returns stable paginated list fields', async ({ db }) => {
    const events: OperationAuditEvent[] = []
    const allowed = await createSystemAccessFixture(db, {
      accessCodes: ['ops:operation-log:list'],
      usernamePrefix: 'operation-log-reader',
    })
    const denied = await createSystemAccessFixture(db, {
      usernamePrefix: 'operation-log-denied',
    })
    const ids = await seedLogs(db)
    const app = createApp(db, { operationAuditSink: createAuditSink(events) })

    const deniedResponse = await app.request('/api/ops/operation-logs', {
      headers: denied.authHeaders,
    })
    const response = await app.request('/api/ops/operation-logs?page=1&pageSize=2', {
      headers: allowed.authHeaders,
    })
    const rawBody = (await response.json()) as { list: Record<string, unknown>[] }
    const body = operationLogListResponseSchema.parse(rawBody)

    expect(deniedResponse.status).toBe(403)
    expect(response.status).toBe(200)
    expect(body).toMatchObject({ total: 3, page: 1, pageSize: 2 })
    expect(body.list.map(({ id }) => id)).toEqual([ids.newestId, ids.middleId])
    expect(Object.keys(rawBody.list[0] ?? {}).sort()).toEqual(
      [
        'id',
        'actorUserId',
        'actorUsername',
        'actorNickname',
        'module',
        'action',
        'targetType',
        'targetKey',
        'targetLabel',
        'result',
        'httpStatus',
        'durationMs',
        'clientIp',
        'createdAt',
      ].sort(),
    )
    expect(body.list[0]).not.toHaveProperty('actorSessionId')
    expect(body.list[0]).not.toHaveProperty('requestId')
    expect(body.list[0]).not.toHaveProperty('clientIpSource')
    expect(body.list[0]).not.toHaveProperty('userAgent')
    const secondPage = operationLogListResponseSchema.parse(
      await (
        await app.request('/api/ops/operation-logs?page=2&pageSize=2', {
          headers: allowed.authHeaders,
        })
      ).json(),
    )
    expect(secondPage.list.map(({ id }) => id)).toEqual([ids.oldestId])
    expect(events).toEqual([])
  })

  dbTest('intersects every filter while preserving OR and exact-match rules', async ({ db }) => {
    const reader = await createSystemAccessFixture(db, {
      accessCodes: ['ops:operation-log:list'],
      usernamePrefix: 'operation-log-filter-reader',
    })
    const ids = await seedLogs(db)
    const app = createApp(db)
    const request = async (query: string) => {
      const response = await app.request(`/api/ops/operation-logs?${query}`, {
        headers: reader.authHeaders,
      })
      expect(response.status).toBe(200)
      return operationLogListResponseSchema.parse(await response.json()).list
    }
    const resultIds = (list: OperationLogListItem[]) => list.map(({ id }) => id)

    expect(resultIds(await request('actorKeyword=alice.operator'))).toEqual([
      ids.middleId,
      ids.oldestId,
    ])
    expect(resultIds(await request('actorKeyword=nickname%20match'))).toEqual([ids.newestId])
    expect(resultIds(await request(`actorKeyword=${actorUserId}`))).toEqual([
      ids.newestId,
      ids.middleId,
      ids.oldestId,
    ])
    expect(resultIds(await request(`actorKeyword=${actorSessionId}`))).toEqual([])
    expect(resultIds(await request(`actorSessionId=${actorSessionId}`))).toEqual([
      ids.newestId,
      ids.oldestId,
    ])
    expect(resultIds(await request('clientIp=198.51.100.5'))).toEqual([ids.middleId])
    expect(resultIds(await request(`requestId=${ids.failureRequestId}`))).toEqual([ids.newestId])
    expect(resultIds(await request('occurredFrom=2026-08-19T10%3A00%3A00.000%2B00%3A00'))).toEqual([
      ids.newestId,
      ids.middleId,
    ])
    expect(resultIds(await request('occurredTo=2026-08-19T09%3A00%3A00.000%2B00%3A00'))).toEqual([
      ids.oldestId,
    ])
    expect(resultIds(await request('targetKeyword=account'))).toEqual([ids.newestId, ids.oldestId])
    expect(
      resultIds(
        await request(
          `actorSessionId=${actorSessionId}&module=content&action=content%3Aannouncement%3Adelete&result=failure&httpStatus=409&clientIp=203.0.113.8&requestId=${ids.failureRequestId}&occurredFrom=2026-08-19T10%3A00%3A00.000%2B00%3A00&occurredTo=2026-08-19T10%3A00%3A00.000%2B00%3A00`,
        ),
      ),
    ).toEqual([ids.newestId])
    expect(resultIds(await request('result=success&httpStatus=409'))).toEqual([])
    expect(
      resultIds(await request('module=system&action=content%3Aannouncement%3Adelete')),
    ).toEqual([])
  })

  dbTest('returns detail mapping and boundary errors without auditing reads', async ({ db }) => {
    const events: OperationAuditEvent[] = []
    const reader = await createSystemAccessFixture(db, {
      accessCodes: ['ops:operation-log:list'],
      usernamePrefix: 'operation-log-detail-reader',
    })
    const denied = await createSystemAccessFixture(db, {
      usernamePrefix: 'operation-log-detail-denied',
    })
    const ids = await seedLogs(db)
    const app = createApp(db, { operationAuditSink: createAuditSink(events) })

    const response = await app.request(`/api/ops/operation-logs/${ids.newestId}`, {
      headers: reader.authHeaders,
    })
    const detail = operationLogDetailSchema.parse(await response.json())
    const deniedResponse = await app.request(`/api/ops/operation-logs/${ids.newestId}`, {
      headers: denied.authHeaders,
    })
    const invalid = await app.request('/api/ops/operation-logs/not-a-uuid', {
      headers: reader.authHeaders,
    })
    const missing = await app.request(`/api/ops/operation-logs/${randomUUID()}`, {
      headers: reader.authHeaders,
    })
    const invalidQuery = await app.request('/api/ops/operation-logs?page=0', {
      headers: reader.authHeaders,
    })

    expect(response.status).toBe(200)
    expect(detail).toMatchObject({
      id: ids.newestId,
      actorIsAdmin: true,
      actorSessionId,
      requestId: ids.failureRequestId,
      clientIpSource: 'x-forwarded-for',
      userAgent: {
        raw: expect.stringContaining('Chrome/120'),
        browser: { name: 'Chrome', version: '120.0.0.0' },
        operatingSystem: { name: 'macOS', version: '10.15.7' },
        deviceType: 'desktop',
      },
    })
    expect(deniedResponse.status).toBe(403)
    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toEqual({ message: '操作日志 ID 无效' })
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({ message: '操作日志不存在' })
    expect(invalidQuery.status).toBe(400)
    expect(await invalidQuery.json()).toEqual({ message: '请求参数无效' })
    expect(events).toEqual([])
  })

  dbTest('lets unknown database errors reach the root 500 handler', async ({ db }) => {
    const reader = await createSystemAccessFixture(db, {
      accessCodes: ['ops:operation-log:list'],
      usernamePrefix: 'operation-log-db-error-reader',
    })
    const app = createApp(db)

    await db.execute(sql`alter table ops_operation_logs rename to ops_operation_logs_unavailable`)
    const response = await app.request('/api/ops/operation-logs', {
      headers: reader.authHeaders,
    })

    expect(response.status).toBe(500)
    expect(await response.text()).toBe('Internal Server Error')
  })
})
