import { randomUUID } from 'node:crypto'
import { loginLogListResponseSchema } from '@rev30/contracts'
import { describe, expect } from 'vitest'
import { opsLoginLogs } from '../../../../src/db/schema'
import type { OperationLogEvent } from '../../../../src/runtime/operation-log'
import { dbTest } from '../../../fixtures/database'
import { createApp } from '../../../helpers/app'
import { createSystemAccessFixture } from '../../../helpers/auth'
import { createSystemUserFixture } from '../../../helpers/system'

function createOperationLogReceiver(events: OperationLogEvent[]) {
  return (event: OperationLogEvent) => {
    events.push(event)
  }
}

describe('login log routes', () => {
  dbTest(
    'lists login logs with exact permission, filters, pagination, sorting, and contract fields',
    async ({ db: database }) => {
      const authorized = await createSystemAccessFixture(database, {
        accessCodes: ['ops:login-log:list'],
        usernamePrefix: 'ops-login-log-reader',
      })
      const events: OperationLogEvent[] = []
      const app = createApp(database, { operationLogReceiver: createOperationLogReceiver(events) })
      const targetUser = await createSystemUserFixture(database, { username: 'Alice.Target' })
      const firstId = randomUUID()
      const secondId = randomUUID()
      const sessionId = randomUUID()

      await database.insert(opsLoginLogs).values([
        {
          id: firstId,
          userId: targetUser.id,
          username: 'Alice.Target',
          result: 'success',
          sessionId,
          requestId: randomUUID(),
          clientIp: '203.0.113.10',
          clientIpSource: 'x-forwarded-for',
          userAgent: 'unrecognized-client',
          createdAt: new Date('2026-08-18T08:00:00.000Z'),
        },
        {
          id: secondId,
          username: 'alice.target',
          result: 'failure',
          failureReason: 'invalid_credentials',
          requestId: randomUUID(),
          clientIp: '203.0.113.10',
          clientIpSource: 'socket',
          createdAt: new Date('2026-08-18T09:00:00.000Z'),
        },
        {
          username: 'other-user',
          result: 'failure',
          failureReason: 'rate_limited',
          requestId: randomUUID(),
          clientIp: '203.0.113.10',
          clientIpSource: 'socket',
          createdAt: new Date('2026-08-18T10:00:00.000Z'),
        },
      ])

      await database.insert(opsLoginLogs).values(
        [
          { clientIp: '203.0.113.11', createdAt: new Date('2026-08-18T09:00:00.000Z') },
          { clientIp: '203.0.113.10', createdAt: new Date('2026-08-18T06:59:59.999Z') },
          { clientIp: '203.0.113.10', createdAt: new Date('2026-08-18T10:00:00.001Z') },
        ].map((sample) => ({
          ...sample,
          username: 'alice.target',
          result: 'failure' as const,
          failureReason: 'invalid_credentials' as const,
          requestId: randomUUID(),
          clientIpSource: 'socket' as const,
        })),
      )
      const query =
        '/api/ops/login-logs?username=ALICE&clientIp=203.0.113.10&occurredFrom=2026-08-18T07%3A00%3A00.000Z&occurredTo=2026-08-18T10%3A00%3A00.000Z&pageSize=1'
      const response = await app.request(`${query}&page=1`, { headers: authorized.authHeaders })
      const body = loginLogListResponseSchema.parse(await response.json())

      expect(response.status).toBe(200)
      expect(body).toMatchObject({ total: 2, page: 1, pageSize: 1 })
      expect(body.list).toEqual([
        expect.objectContaining({
          id: secondId,
          username: 'alice.target',
          result: 'failure',
          failureReason: 'invalid_credentials',
          userAgent: null,
        }),
      ])
      const secondPageResponse = await app.request(`${query}&page=2`, {
        headers: authorized.authHeaders,
      })
      expect(secondPageResponse.status).toBe(200)
      const secondPage = loginLogListResponseSchema.parse(await secondPageResponse.json())
      expect(secondPage).toMatchObject({ total: 2, page: 2, pageSize: 1 })
      expect(secondPage.list.map(({ id }) => id)).toEqual([firstId])
      expect(Object.keys(body.list[0] ?? {}).sort()).toEqual([
        'clientIp',
        'clientIpSource',
        'createdAt',
        'failureReason',
        'id',
        'requestId',
        'result',
        'sessionId',
        'userAgent',
        'userId',
        'username',
      ])
      const listEvent = {
        action: 'ops:login-log:list',
        actorUserId: authorized.userId,
        targetKey: null,
        targetLabel: null,
        result: 'success',
        httpStatus: 200,
      }
      expect(events).toMatchObject([listEvent, listEvent])
      expect(JSON.stringify(events)).not.toMatch(/alice|203\.0\.113\.10/i)
    },
  )

  dbTest('does not record requests rejected by access or query validation', async ({ db }) => {
    const events: OperationLogEvent[] = []
    const reader = await createSystemAccessFixture(db, {
      accessCodes: ['ops:login-log:list'],
      usernamePrefix: 'ops-login-log-validator',
    })
    const denied = await createSystemAccessFixture(db, {
      accessCodes: ['ops:online-session:list'],
      usernamePrefix: 'ops-login-log-denied',
    })
    const app = createApp(db, { operationLogReceiver: createOperationLogReceiver(events) })

    const invalidPageSize = await app.request('/api/ops/login-logs?pageSize=101', {
      headers: reader.authHeaders,
    })
    expect(invalidPageSize.status).toBe(400)
    expect(await invalidPageSize.json()).toEqual({ message: '请求参数无效' })

    const invalidRange = await app.request(
      '/api/ops/login-logs?occurredFrom=2026-08-19T00%3A00%3A00Z&occurredTo=2026-08-18T00%3A00%3A00Z',
      { headers: reader.authHeaders },
    )
    expect(invalidRange.status).toBe(400)
    expect(await invalidRange.json()).toEqual({ message: '请求参数无效' })

    const forbidden = await app.request('/api/ops/login-logs', { headers: denied.authHeaders })
    expect(forbidden.status).toBe(403)
    expect(events).toEqual([])
  })
})
