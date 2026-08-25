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
      const app = createApp(database)
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
          clientIpSource: 'unavailable',
          createdAt: new Date('2026-08-18T10:00:00.000Z'),
        },
      ])

      const response = await app.request(
        '/api/ops/login-logs?username=ALICE&clientIp=203.0.113.10&occurredFrom=2026-08-18T07%3A00%3A00.000Z&occurredTo=2026-08-18T10%3A00%3A00.000Z&page=1&pageSize=1',
        { headers: authorized.authHeaders },
      )
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
    },
  )

  dbTest('rejects invalid queries and does not record read-only requests', async ({ db }) => {
    const events: OperationLogEvent[] = []
    const reader = await createSystemAccessFixture(db, {
      accessCodes: ['ops:login-log:list'],
      usernamePrefix: 'ops-login-log-validator',
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

    const list = await app.request('/api/ops/login-logs', { headers: reader.authHeaders })
    expect(list.status).toBe(200)
    expect(events).toEqual([])
  })
})
