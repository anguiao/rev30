import { randomUUID } from 'node:crypto'
import { loginLogListResponseSchema, onlineSessionListResponseSchema } from '@rev30/contracts'
import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { describe, expect } from 'vitest'
import { authSessions, opsLoginLogs } from '../../../src/db/schema'
import { createAuthMiddleware } from '../../../src/middleware/auth'
import {
  createAttachmentAccessToken,
  verifyAttachmentAccessToken,
} from '../../../src/modules/attachments/access-token'
import { readAuthConfig } from '../../../src/modules/auth/config'
import {
  AuthInvalidRefreshTokenError,
  AuthUnauthorizedError,
} from '../../../src/modules/auth/errors'
import { createAuthRepository } from '../../../src/modules/auth/repository'
import { createAuthService } from '../../../src/modules/auth/service'
import { createTokenPair } from '../../../src/modules/auth/tokens'
import { createOpsRoutes } from '../../../src/modules/ops/routes'
import { dbTest, type TestDatabase } from '../../fixtures/database'
import { createSystemAccessFixture } from '../../helpers/auth'
import { createSystemUserFixture } from '../../helpers/system'

function createTestApp(database: TestDatabase, authHeaders: Record<string, string>) {
  const app = new Hono().route(
    '/api/ops',
    createOpsRoutes(database, createAuthMiddleware(database)),
  )
  const request = app.request.bind(app)

  app.request = ((input, init) =>
    request(input, {
      ...init,
      headers: new Headers({ ...authHeaders, ...Object.fromEntries(new Headers(init?.headers)) }),
    })) as typeof app.request

  return app
}

async function insertSession(
  database: TestDatabase,
  input: {
    id?: string
    userId: string
    refreshTokenHash?: string
    createdAt: Date
    lastActiveAt: Date
    expiresAt?: Date
    revokedAt?: Date
    createdIp?: string
    userAgent?: string
  },
) {
  const id = input.id ?? randomUUID()
  await database.insert(authSessions).values({
    id,
    userId: input.userId,
    refreshTokenHash: input.refreshTokenHash ?? randomUUID(),
    createdIp: input.createdIp,
    createdIpSource: input.createdIp ? 'socket' : 'unavailable',
    userAgent: input.userAgent,
    lastActiveAt: input.lastActiveAt,
    expiresAt: input.expiresAt ?? new Date(Date.now() + 60_000),
    revokedAt: input.revokedAt,
    revocationReason: input.revokedAt ? 'logout' : undefined,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  })
  return id
}

describe('ops routes', () => {
  dbTest(
    'lists login logs with exact permission, filters, pagination, sorting, and contract fields',
    async ({ db: database }) => {
      const authorized = await createSystemAccessFixture(database, {
        accessCodes: ['ops:login-log:list'],
        usernamePrefix: 'ops-login-log-reader',
      })
      const app = createTestApp(database, authorized.authHeaders)
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

  dbTest('requires admin or the exact list permission', async ({ db: database }) => {
    const admin = await createSystemAccessFixture(database, {
      admin: true,
      usernamePrefix: 'ops-admin',
    })
    const missing = await createSystemAccessFixture(database, {
      accessCodes: ['ops:login-log:list'],
      usernamePrefix: 'ops-missing-session-list',
    })

    expect(
      (await createTestApp(database, admin.authHeaders).request('/api/ops/sessions')).status,
    ).toBe(200)
    expect(
      (await createTestApp(database, missing.authHeaders).request('/api/ops/sessions')).status,
    ).toBe(403)
  })

  dbTest(
    'lists only active sessions, marks the current session, and sorts activity deterministically',
    async ({ db: database }) => {
      const reader = await createSystemAccessFixture(database, {
        accessCodes: ['ops:online-session:list'],
        usernamePrefix: 'ops-session-reader',
      })
      const app = createTestApp(database, reader.authHeaders)
      const target = await createSystemUserFixture(database, { username: 'Session.Target' })
      const olderId = await insertSession(database, {
        userId: target.id,
        createdIp: '198.51.100.7',
        createdAt: new Date('2026-08-18T07:00:00.000Z'),
        lastActiveAt: new Date('2026-08-18T08:00:00.000Z'),
        userAgent: 'unrecognized-client',
      })
      const newerId = await insertSession(database, {
        userId: target.id,
        createdIp: '198.51.100.7',
        createdAt: new Date('2026-08-18T08:30:00.000Z'),
        lastActiveAt: new Date('2026-08-18T09:00:00.000Z'),
      })
      await insertSession(database, {
        userId: target.id,
        createdAt: new Date(),
        lastActiveAt: new Date(),
        revokedAt: new Date(),
      })

      const response = await app.request(
        '/api/ops/sessions?username=session&createdIp=198.51.100.7&page=1&pageSize=20',
      )
      const body = onlineSessionListResponseSchema.parse(await response.json())

      expect(response.status).toBe(200)
      expect(body.total).toBe(2)
      expect(body.list.map(({ id }) => id)).toEqual([newerId, olderId])
      expect(body.list.every(({ isCurrent }) => !isCurrent)).toBe(true)

      const allSessions = onlineSessionListResponseSchema.parse(
        await (await app.request('/api/ops/sessions?pageSize=100')).json(),
      )
      expect(allSessions.list.find(({ userId }) => userId === reader.userId)?.isCurrent).toBe(true)
    },
  )

  dbTest(
    'protects the current session and invalidates every token bound to an active target',
    async ({ db: database }) => {
      const operator = await createSystemAccessFixture(database, {
        accessCodes: ['ops:online-session:revoke'],
        usernamePrefix: 'ops-session-revoker',
      })
      const app = createTestApp(database, operator.authHeaders)
      const [operatorSession] = await database
        .select({ id: authSessions.id })
        .from(authSessions)
        .where(eq(authSessions.userId, operator.userId))
        .limit(1)
      const target = await createSystemUserFixture(database, { username: 'revocation-target' })
      const targetSessionId = randomUUID()
      const config = readAuthConfig()
      const targetTokens = await createTokenPair(target.id, targetSessionId, config)
      const targetAttachmentToken = await createAttachmentAccessToken(
        target.id,
        targetSessionId,
        config,
      )
      const activeId = await insertSession(database, {
        id: targetSessionId,
        userId: target.id,
        refreshTokenHash: targetTokens.refreshTokenHash,
        createdAt: new Date(),
        lastActiveAt: new Date(),
      })
      const expiredId = await insertSession(database, {
        userId: target.id,
        createdAt: new Date(),
        lastActiveAt: new Date(),
        expiresAt: new Date(Date.now() - 1),
      })

      expect(
        (await app.request(`/api/ops/sessions/${operatorSession?.id}`, { method: 'DELETE' }))
          .status,
      ).toBe(409)
      expect(
        (await app.request(`/api/ops/sessions/${expiredId}`, { method: 'DELETE' })).status,
      ).toBe(404)
      expect(
        (await app.request(`/api/ops/sessions/${activeId}`, { method: 'DELETE' })).status,
      ).toBe(204)
      expect(
        (await app.request(`/api/ops/sessions/${activeId}`, { method: 'DELETE' })).status,
      ).toBe(404)

      const [revoked] = await database
        .select()
        .from(authSessions)
        .where(eq(authSessions.id, activeId))
      expect(revoked).toMatchObject({ revocationReason: 'admin_forced' })
      expect(revoked?.revokedAt).toBeInstanceOf(Date)

      const authService = createAuthService(database, config)
      await expect(authService.me(targetTokens.accessToken)).rejects.toBeInstanceOf(
        AuthUnauthorizedError,
      )
      await expect(authService.refresh(targetTokens.refreshToken)).rejects.toBeInstanceOf(
        AuthInvalidRefreshTokenError,
      )
      const attachment = await verifyAttachmentAccessToken(targetAttachmentToken, config)
      await expect(
        createAuthRepository(database).findValidSessionUser(
          attachment.sessionId,
          attachment.userId,
          new Date(),
        ),
      ).resolves.toBeUndefined()

      const operatorAccessToken = operator.authHeaders.authorization?.replace(/^Bearer /, '')
      await expect(authService.me(operatorAccessToken)).resolves.toMatchObject({
        currentSessionId: operatorSession?.id,
      })
    },
  )

  dbTest(
    'returns contract validation errors for invalid list queries and session ids',
    async ({ db: database }) => {
      const operator = await createSystemAccessFixture(database, {
        accessCodes: ['ops:login-log:list', 'ops:online-session:revoke'],
        usernamePrefix: 'ops-validator',
      })
      const app = createTestApp(database, operator.authHeaders)

      const invalidPageSize = await app.request('/api/ops/login-logs?pageSize=101')
      expect(invalidPageSize.status).toBe(400)
      expect(await invalidPageSize.json()).toEqual({ message: '请求参数无效' })

      const invalidRange = await app.request(
        '/api/ops/login-logs?occurredFrom=2026-08-19T00%3A00%3A00Z&occurredTo=2026-08-18T00%3A00%3A00Z',
      )
      expect(invalidRange.status).toBe(400)
      expect(await invalidRange.json()).toEqual({ message: '请求参数无效' })

      const invalidId = await app.request('/api/ops/sessions/not-a-uuid', { method: 'DELETE' })
      expect(invalidId.status).toBe(400)
      expect(await invalidId.json()).toEqual({ message: '会话 ID 无效' })
    },
  )
})
