import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { authLoginAttemptBuckets, authRefreshTokens, systemUsers } from '../../src/db/schema'
import {
  cleanupAuthRefreshTokens,
  startAuthRefreshTokenCleanup,
} from '../../src/db/maintenance/refresh-token-cleanup'
import {
  cleanupAuthLoginAttemptBuckets,
  startAuthLoginAttemptCleanup,
} from '../../src/db/maintenance/login-attempt-cleanup'
import { createTestDb } from '../helpers/db'

const hourMs = 60 * 60 * 1000

describe('database maintenance', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('removes expired refresh tokens and revoked tokens beyond the retention window', async () => {
    const database = await createTestDb()
    const now = new Date()
    const userId = randomUUID()

    await database.insert(systemUsers).values({
      id: userId,
      username: 'maintenance-user',
      nickname: 'Maintenance User',
      createdAt: now,
      updatedAt: now,
    })

    await database.insert(authRefreshTokens).values([
      {
        id: randomUUID(),
        userId,
        tokenHash: 'expired-active',
        expiresAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: randomUUID(),
        userId,
        tokenHash: 'expired-revoked-recently',
        expiresAt: new Date(now.getTime() - hourMs),
        revokedAt: new Date(now.getTime() - hourMs),
        createdAt: now,
        updatedAt: now,
      },
      {
        id: randomUUID(),
        userId,
        tokenHash: 'revoked-before-retention',
        expiresAt: new Date(now.getTime() + hourMs),
        revokedAt: new Date(now.getTime() - 25 * hourMs),
        createdAt: now,
        updatedAt: now,
      },
      {
        id: randomUUID(),
        userId,
        tokenHash: 'revoked-within-retention',
        expiresAt: new Date(now.getTime() + hourMs),
        revokedAt: new Date(now.getTime() - hourMs),
        createdAt: now,
        updatedAt: now,
      },
      {
        id: randomUUID(),
        userId,
        tokenHash: 'usable',
        expiresAt: new Date(now.getTime() + hourMs),
        createdAt: now,
        updatedAt: now,
      },
    ])

    const deletedCount = await cleanupAuthRefreshTokens(database, 24 * hourMs)

    const remaining = await database
      .select({
        tokenHash: authRefreshTokens.tokenHash,
      })
      .from(authRefreshTokens)
      .where(eq(authRefreshTokens.userId, userId))
      .orderBy(authRefreshTokens.tokenHash)

    expect(deletedCount).toBe(3)
    expect(remaining.map((session) => session.tokenHash)).toEqual([
      'revoked-within-retention',
      'usable',
    ])
  })

  it('removes login attempt buckets outside the retention window', async () => {
    const database = await createTestDb()
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

  it('runs refresh token cleanup after the previous run finishes', async () => {
    vi.useFakeTimers()
    vi.stubEnv('AUTH_REFRESH_TOKEN_CLEANUP_INTERVAL_MS', '50')
    vi.stubEnv('AUTH_REVOKED_REFRESH_TOKEN_RETENTION_MS', '0')

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

    const worker = startAuthRefreshTokenCleanup({
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

  it('keeps refresh token cleanup disabled when the interval is zero', async () => {
    vi.useFakeTimers()
    vi.stubEnv('AUTH_REFRESH_TOKEN_CLEANUP_INTERVAL_MS', '0')

    const returning = vi.fn(() => Promise.resolve([]))
    const worker = startAuthRefreshTokenCleanup({
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

  it('keeps login attempt cleanup disabled when the interval is zero', async () => {
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

  it('fails fast for invalid maintenance durations', () => {
    vi.stubEnv('AUTH_REFRESH_TOKEN_CLEANUP_INTERVAL_MS', 'abc')

    expect(() => startAuthRefreshTokenCleanup({} as never)).toThrow(
      'AUTH_REFRESH_TOKEN_CLEANUP_INTERVAL_MS 必须是 0 或正整数毫秒值',
    )

    vi.unstubAllEnvs()
    vi.stubEnv('AUTH_REFRESH_TOKEN_CLEANUP_INTERVAL_MS', `${2 ** 31}`)

    expect(() => startAuthRefreshTokenCleanup({} as never)).toThrow(
      'AUTH_REFRESH_TOKEN_CLEANUP_INTERVAL_MS 必须是 0 或正整数毫秒值',
    )

    vi.unstubAllEnvs()
    vi.stubEnv('AUTH_REVOKED_REFRESH_TOKEN_RETENTION_MS', '-1')

    expect(() => startAuthRefreshTokenCleanup({} as never)).toThrow(
      'AUTH_REVOKED_REFRESH_TOKEN_RETENTION_MS 必须是 0 或正整数毫秒值',
    )
  })
})
