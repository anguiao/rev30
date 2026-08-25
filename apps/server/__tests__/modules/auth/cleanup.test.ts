import { randomUUID } from 'node:crypto'
import { describe, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { authLoginAttemptBuckets, authSessions, systemUsers } from '../../../src/db/schema'
import {
  cleanupAuthLoginAttemptBuckets,
  cleanupAuthSessions,
} from '../../../src/modules/auth/cleanup'
import { dbTest } from '../../fixtures/database'

const hourMs = 60 * 60 * 1000

describe('auth cleanup', () => {
  dbTest(
    'removes expired sessions immediately and revoked sessions at the retention boundary',
    async ({ db: database }) => {
      const now = new Date()
      const userId = randomUUID()

      await database.insert(systemUsers).values({
        id: userId,
        username: `cleanup-user-${userId.slice(0, 8)}`,
        nickname: 'Cleanup User',
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

      await expect(cleanupAuthSessions(database, 24 * hourMs)).resolves.toBe(3)
      await expect(
        database
          .select({ refreshTokenHash: authSessions.refreshTokenHash })
          .from(authSessions)
          .where(eq(authSessions.userId, userId))
          .orderBy(authSessions.refreshTokenHash),
      ).resolves.toEqual([
        { refreshTokenHash: 'revoked-within-retention' },
        { refreshTokenHash: 'usable' },
      ])
    },
  )

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

    await expect(cleanupAuthLoginAttemptBuckets(database, 24 * hourMs)).resolves.toBe(2)
  })
})
