import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import {
  authLoginAttemptBuckets,
  authSessions,
  opsLoginLogs,
  systemUsers,
} from '../../src/db/schema'
import { startAppMaintenance } from '../../src/maintenance'
import { startAttachmentCleanup } from '../../src/maintenance/attachment-cleanup'
import { startAuthLoginAttemptCleanup } from '../../src/maintenance/auth-login-attempt-cleanup'
import { startAuthSessionCleanup } from '../../src/maintenance/auth-session-cleanup'
import { startOpsLoginLogCleanup } from '../../src/maintenance/ops-login-log-cleanup'
import { cleanupAuthLoginAttemptBuckets, cleanupAuthSessions } from '../../src/modules/auth/cleanup'
import { cleanupLoginLogs } from '../../src/modules/ops/login-logs/cleanup'
import { dbTest } from '../fixtures/database'

const hourMs = 60 * 60 * 1000

describe('auth maintenance', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  dbTest(
    'removes expired sessions immediately and revoked sessions at the retention boundary',
    async ({ db: database }) => {
      const now = new Date()
      const userId = randomUUID()

      await database.insert(systemUsers).values({
        id: userId,
        username: 'maintenance-user',
        nickname: 'Maintenance User',
        createdAt: now,
        updatedAt: now,
      })

      await database.insert(authSessions).values([
        {
          id: randomUUID(),
          userId,
          refreshTokenHash: 'expired-active',
          expiresAt: now,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: randomUUID(),
          userId,
          refreshTokenHash: 'expired-revoked-recently',
          expiresAt: new Date(now.getTime() - hourMs),
          revokedAt: new Date(now.getTime() - hourMs),
          revocationReason: 'logout',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: randomUUID(),
          userId,
          refreshTokenHash: 'revoked-at-retention',
          expiresAt: new Date(now.getTime() + hourMs),
          revokedAt: new Date(now.getTime() - 24 * hourMs),
          revocationReason: 'logout',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: randomUUID(),
          userId,
          refreshTokenHash: 'revoked-within-retention',
          expiresAt: new Date(now.getTime() + hourMs),
          revokedAt: new Date(now.getTime() - hourMs),
          revocationReason: 'logout',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: randomUUID(),
          userId,
          refreshTokenHash: 'usable',
          expiresAt: new Date(now.getTime() + hourMs),
          createdAt: now,
          updatedAt: now,
        },
      ])

      const deletedCount = await cleanupAuthSessions(database, 24 * hourMs)

      const remaining = await database
        .select({
          refreshTokenHash: authSessions.refreshTokenHash,
        })
        .from(authSessions)
        .where(eq(authSessions.userId, userId))
        .orderBy(authSessions.refreshTokenHash)

      expect(deletedCount).toBe(3)
      expect(remaining.map((session) => session.refreshTokenHash)).toEqual([
        'revoked-within-retention',
        'usable',
      ])
    },
  )

  dbTest('removes login logs at the retention boundary', async ({ db: database }) => {
    const now = new Date()
    const dayMs = 24 * hourMs
    const createLog = (username: string, createdAt: Date) => ({
      username,
      result: 'failure',
      failureReason: 'invalid_credentials',
      requestId: randomUUID(),
      clientIpSource: 'unavailable',
      createdAt,
    })

    await database
      .insert(opsLoginLogs)
      .values([
        createLog('older-than-retention', new Date(now.getTime() - 90 * dayMs - hourMs)),
        createLog('at-retention', new Date(now.getTime() - 90 * dayMs)),
        createLog('within-retention', new Date(now.getTime() - 90 * dayMs + hourMs)),
      ])

    const deletedCount = await cleanupLoginLogs(database, 90 * dayMs)
    const remaining = await database
      .select({ username: opsLoginLogs.username })
      .from(opsLoginLogs)
      .orderBy(opsLoginLogs.username)

    expect(deletedCount).toBe(2)
    expect(remaining).toEqual([{ username: 'within-retention' }])
  })

  dbTest('removes login attempt buckets outside the retention window', async ({ db: database }) => {
    const now = new Date()

    await database.insert(authLoginAttemptBuckets).values([
      {
        username: 'expired-open-window',
        failedCount: 1,
        windowStartedAt: new Date(now.getTime() - 25 * hourMs),
        lastFailedAt: new Date(now.getTime() - 25 * hourMs),
        createdAt: now,
        updatedAt: now,
      },
      {
        username: 'expired-lock',
        failedCount: 5,
        windowStartedAt: new Date(now.getTime() - 48 * hourMs),
        lastFailedAt: new Date(now.getTime() - 48 * hourMs),
        lockedUntil: new Date(now.getTime() - 25 * hourMs),
        createdAt: now,
        updatedAt: now,
      },
      {
        username: 'recent-open-window',
        failedCount: 1,
        windowStartedAt: new Date(now.getTime() - hourMs),
        lastFailedAt: new Date(now.getTime() - hourMs),
        createdAt: now,
        updatedAt: now,
      },
      {
        username: 'recent-lock',
        failedCount: 5,
        windowStartedAt: new Date(now.getTime() - 2 * hourMs),
        lastFailedAt: new Date(now.getTime() - 2 * hourMs),
        lockedUntil: new Date(now.getTime() - hourMs),
        createdAt: now,
        updatedAt: now,
      },
    ])

    const deletedCount = await cleanupAuthLoginAttemptBuckets(database, 24 * hourMs)

    const remaining = await database
      .select({ username: authLoginAttemptBuckets.username })
      .from(authLoginAttemptBuckets)
      .orderBy(authLoginAttemptBuckets.username)

    expect(deletedCount).toBe(2)
    expect(remaining.map((bucket) => bucket.username)).toEqual([
      'recent-lock',
      'recent-open-window',
    ])
  })

  dbTest('runs session cleanup after the previous run finishes', async () => {
    vi.useFakeTimers()
    vi.stubEnv('AUTH_SESSION_CLEANUP_INTERVAL_MS', '50')
    vi.stubEnv('AUTH_REVOKED_SESSION_RETENTION_MS', '0')

    const resolvers: ((rows: { id: string }[]) => void)[] = []
    const returning = vi.fn(
      () =>
        new Promise<{ id: string }[]>((resolve) => {
          resolvers.push(resolve)
        }),
    )
    const where = vi.fn(() => ({
      returning,
    }))
    const deleteTable = vi.fn(() => ({
      where,
    }))

    const worker = startAuthSessionCleanup({
      delete: deleteTable,
    } as never)

    await vi.advanceTimersByTimeAsync(0)
    expect(returning).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(100)
    expect(returning).toHaveBeenCalledTimes(1)

    resolvers.shift()?.([])
    await Promise.resolve()
    await Promise.resolve()

    await vi.advanceTimersByTimeAsync(49)
    expect(returning).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(returning).toHaveBeenCalledTimes(2)

    const stopPromise = worker.stop()
    resolvers.shift()?.([])
    await Promise.resolve()
    await stopPromise
    await vi.advanceTimersByTimeAsync(100)

    expect(returning).toHaveBeenCalledTimes(2)
  })

  dbTest(
    'keeps session cleanup disabled when the interval is zero and ignores old settings',
    async () => {
      vi.useFakeTimers()
      vi.stubEnv('AUTH_SESSION_CLEANUP_INTERVAL_MS', '0')
      vi.stubEnv('AUTH_REFRESH_TOKEN_CLEANUP_INTERVAL_MS', 'invalid-old-value')
      vi.stubEnv('AUTH_REVOKED_REFRESH_TOKEN_RETENTION_MS', 'invalid-old-value')

      const returning = vi.fn(() => Promise.resolve([]))
      const worker = startAuthSessionCleanup({
        delete: vi.fn(() => ({
          where: vi.fn(() => ({
            returning,
          })),
        })),
      } as never)

      await vi.advanceTimersByTimeAsync(0)
      await worker.stop()

      expect(returning).not.toHaveBeenCalled()
    },
  )

  dbTest('keeps ops login log cleanup disabled when the interval is zero', async () => {
    vi.useFakeTimers()
    vi.stubEnv('OPS_LOGIN_LOG_CLEANUP_INTERVAL_MS', '0')

    const returning = vi.fn(() => Promise.resolve([]))
    const worker = startOpsLoginLogCleanup({
      delete: vi.fn(() => ({
        where: vi.fn(() => ({ returning })),
      })),
    } as never)

    await vi.advanceTimersByTimeAsync(0)
    await worker.stop()

    expect(returning).not.toHaveBeenCalled()
  })

  dbTest('keeps login attempt cleanup disabled when the interval is zero', async () => {
    vi.useFakeTimers()
    vi.stubEnv('AUTH_LOGIN_ATTEMPT_CLEANUP_INTERVAL_MS', '0')

    const returning = vi.fn(() => Promise.resolve([]))
    const worker = startAuthLoginAttemptCleanup({
      delete: vi.fn(() => ({
        where: vi.fn(() => ({
          returning,
        })),
      })),
    } as never)

    await vi.advanceTimersByTimeAsync(0)
    await worker.stop()

    expect(returning).not.toHaveBeenCalled()
  })

  dbTest('keeps attachment cleanup disabled when the interval is zero', async () => {
    vi.useFakeTimers()
    vi.stubEnv('ATTACHMENT_CLEANUP_INTERVAL_MS', '0')

    const select = vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([])),
          })),
        })),
      })),
    }))
    const worker = startAttachmentCleanup({
      select,
    } as never)

    await vi.advanceTimersByTimeAsync(0)
    await worker.stop()

    expect(select).not.toHaveBeenCalled()
  })

  dbTest('stops earlier maintenance workers when a later worker fails to start', async () => {
    vi.useFakeTimers()
    vi.stubEnv('AUTH_SESSION_CLEANUP_INTERVAL_MS', '50')
    vi.stubEnv('AUTH_LOGIN_ATTEMPT_RETENTION_MS', '-1')

    const returning = vi.fn(() => Promise.resolve([]))
    const database = {
      delete: vi.fn(() => ({
        where: vi.fn(() => ({
          returning,
        })),
      })),
    } as never

    expect(() => {
      startAppMaintenance(database)
    }).toThrow('AUTH_LOGIN_ATTEMPT_RETENTION_MS 必须是 0 或正整数毫秒值')

    await vi.advanceTimersByTimeAsync(0)

    expect(returning).not.toHaveBeenCalled()
  })

  dbTest('stops auth maintenance workers when attachment cleanup fails to start', async () => {
    vi.useFakeTimers()
    vi.stubEnv('AUTH_SESSION_CLEANUP_INTERVAL_MS', '50')
    vi.stubEnv('AUTH_LOGIN_ATTEMPT_CLEANUP_INTERVAL_MS', '50')
    vi.stubEnv('OPS_LOGIN_LOG_CLEANUP_INTERVAL_MS', '50')
    vi.stubEnv('ATTACHMENT_CLEANUP_RETENTION_MS', '0')

    const returning = vi.fn(() => Promise.resolve([]))
    const database = {
      delete: vi.fn(() => ({
        where: vi.fn(() => ({
          returning,
        })),
      })),
    } as never

    expect(() => {
      startAppMaintenance(database)
    }).toThrow('ATTACHMENT_CLEANUP_RETENTION_MS 必须是正整数毫秒值')

    await vi.advanceTimersByTimeAsync(0)

    expect(returning).not.toHaveBeenCalled()
  })

  dbTest(
    'includes operation log cleanup and stops earlier workers when it fails to start',
    async () => {
      vi.useFakeTimers()
      vi.stubEnv('AUTH_SESSION_CLEANUP_INTERVAL_MS', '50')
      vi.stubEnv('AUTH_LOGIN_ATTEMPT_CLEANUP_INTERVAL_MS', '50')
      vi.stubEnv('OPS_LOGIN_LOG_CLEANUP_INTERVAL_MS', '50')
      vi.stubEnv('OPS_OPERATION_LOG_RETENTION_MS', '-1')

      const returning = vi.fn(() => Promise.resolve([]))
      const database = {
        delete: vi.fn(() => ({ where: vi.fn(() => ({ returning })) })),
      } as never

      expect(() => startAppMaintenance(database)).toThrow(
        'OPS_OPERATION_LOG_RETENTION_MS 必须是 0 或正整数毫秒值',
      )
      await vi.advanceTimersByTimeAsync(0)
      expect(returning).not.toHaveBeenCalled()
    },
  )

  dbTest('fails fast for invalid maintenance durations', () => {
    vi.stubEnv('AUTH_SESSION_CLEANUP_INTERVAL_MS', 'abc')

    expect(() => startAuthSessionCleanup({} as never)).toThrow(
      'AUTH_SESSION_CLEANUP_INTERVAL_MS 必须是 0 或正整数毫秒值',
    )

    vi.unstubAllEnvs()
    vi.stubEnv('AUTH_SESSION_CLEANUP_INTERVAL_MS', `${2 ** 31}`)

    expect(() => startAuthSessionCleanup({} as never)).toThrow(
      'AUTH_SESSION_CLEANUP_INTERVAL_MS 必须是 0 或正整数毫秒值',
    )

    vi.unstubAllEnvs()
    vi.stubEnv('AUTH_REVOKED_SESSION_RETENTION_MS', '-1')

    expect(() => startAuthSessionCleanup({} as never)).toThrow(
      'AUTH_REVOKED_SESSION_RETENTION_MS 必须是 0 或正整数毫秒值',
    )

    vi.unstubAllEnvs()
    vi.stubEnv('OPS_LOGIN_LOG_CLEANUP_INTERVAL_MS', `${2 ** 31}`)

    expect(() => startOpsLoginLogCleanup({} as never)).toThrow(
      'OPS_LOGIN_LOG_CLEANUP_INTERVAL_MS 必须是 0 或正整数毫秒值',
    )

    vi.unstubAllEnvs()
    vi.stubEnv('OPS_LOGIN_LOG_RETENTION_MS', '-1')

    expect(() => startOpsLoginLogCleanup({} as never)).toThrow(
      'OPS_LOGIN_LOG_RETENTION_MS 必须是 0 或正整数毫秒值',
    )
  })

  dbTest('fails fast for invalid attachment cleanup settings', () => {
    vi.stubEnv('ATTACHMENT_CLEANUP_INTERVAL_MS', 'abc')

    expect(() => startAttachmentCleanup({} as never)).toThrow(
      'ATTACHMENT_CLEANUP_INTERVAL_MS 必须是 0 或正整数毫秒值',
    )

    vi.unstubAllEnvs()
    vi.stubEnv('ATTACHMENT_CLEANUP_RETENTION_MS', '0')

    expect(() => startAttachmentCleanup({} as never)).toThrow(
      'ATTACHMENT_CLEANUP_RETENTION_MS 必须是正整数毫秒值',
    )
  })
})
