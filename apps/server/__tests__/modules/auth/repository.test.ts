import { describe, expect } from 'vitest'
import { createAuthRepository } from '../../../src/modules/auth/repository'
import { dbTest } from '../../fixtures/database'

describe('auth login attempt repository', () => {
  dbTest('creates a login failure bucket for a new username', async ({ db: database }) => {
    const repository = createAuthRepository(database)
    const attemptTime = new Date('2026-05-14T00:00:00.000Z')

    await repository.recordLoginFailureBucket({
      username: 'missing-user',
      now: attemptTime,
      maxAttempts: 5,
      windowSeconds: 900,
      lockSeconds: 900,
    })

    const bucket = await repository.findLoginAttemptBucketByUsername('missing-user')

    expect(bucket).toMatchObject({
      username: 'missing-user',
      failedCount: 1,
      windowStartedAt: attemptTime,
      lastFailedAt: attemptTime,
      lockedUntil: null,
    })
  })

  dbTest(
    'increments failed count within an active login failure window',
    async ({ db: database }) => {
      const repository = createAuthRepository(database)
      const windowStart = new Date('2026-05-14T00:00:00.000Z')
      const secondAttempt = new Date('2026-05-14T00:01:00.000Z')

      await repository.recordLoginFailureBucket({
        username: 'window-user',
        now: windowStart,
        maxAttempts: 5,
        windowSeconds: 900,
        lockSeconds: 900,
      })
      await repository.recordLoginFailureBucket({
        username: 'window-user',
        now: secondAttempt,
        maxAttempts: 5,
        windowSeconds: 900,
        lockSeconds: 900,
      })

      const bucket = await repository.findLoginAttemptBucketByUsername('window-user')

      expect(bucket).toMatchObject({
        username: 'window-user',
        failedCount: 2,
        windowStartedAt: windowStart,
        lastFailedAt: secondAttempt,
        lockedUntil: null,
      })
    },
  )

  dbTest(
    'locks username when failed login attempts hit the threshold',
    async ({ db: database }) => {
      const repository = createAuthRepository(database)
      const firstAttempt = new Date('2026-05-14T00:00:00.000Z')
      const secondAttempt = new Date('2026-05-14T00:01:00.000Z')
      const thirdAttempt = new Date('2026-05-14T00:02:00.000Z')
      const expectedLockUntil = new Date('2026-05-14T00:17:00.000Z')

      await repository.recordLoginFailureBucket({
        username: 'threshold-user',
        now: firstAttempt,
        maxAttempts: 3,
        windowSeconds: 900,
        lockSeconds: 900,
      })
      await repository.recordLoginFailureBucket({
        username: 'threshold-user',
        now: secondAttempt,
        maxAttempts: 3,
        windowSeconds: 900,
        lockSeconds: 900,
      })
      await repository.recordLoginFailureBucket({
        username: 'threshold-user',
        now: thirdAttempt,
        maxAttempts: 3,
        windowSeconds: 900,
        lockSeconds: 900,
      })

      const bucket = await repository.findLoginAttemptBucketByUsername('threshold-user')

      expect(bucket).toMatchObject({
        username: 'threshold-user',
        failedCount: 3,
        windowStartedAt: firstAttempt,
        lastFailedAt: thirdAttempt,
        lockedUntil: expectedLockUntil,
      })
    },
  )

  dbTest('resets failed count when the login failure window expires', async ({ db: database }) => {
    const repository = createAuthRepository(database)
    const firstAttempt = new Date('2026-05-14T00:00:00.000Z')
    const secondAttempt = new Date('2026-05-14T00:01:00.000Z')
    const expiredWindowAttempt = new Date('2026-05-14T00:16:00.000Z')

    await repository.recordLoginFailureBucket({
      username: 'window-expired-user',
      now: firstAttempt,
      maxAttempts: 5,
      windowSeconds: 900,
      lockSeconds: 900,
    })
    await repository.recordLoginFailureBucket({
      username: 'window-expired-user',
      now: secondAttempt,
      maxAttempts: 5,
      windowSeconds: 900,
      lockSeconds: 900,
    })
    await repository.recordLoginFailureBucket({
      username: 'window-expired-user',
      now: expiredWindowAttempt,
      maxAttempts: 5,
      windowSeconds: 900,
      lockSeconds: 900,
    })

    const bucket = await repository.findLoginAttemptBucketByUsername('window-expired-user')

    expect(bucket).toMatchObject({
      username: 'window-expired-user',
      failedCount: 1,
      windowStartedAt: expiredWindowAttempt,
      lastFailedAt: expiredWindowAttempt,
      lockedUntil: null,
    })
  })

  dbTest(
    'resets failed count when the previous login failure lock expires',
    async ({ db: database }) => {
      const repository = createAuthRepository(database)
      const firstAttempt = new Date('2026-05-14T00:00:00.000Z')
      const secondAttempt = new Date('2026-05-14T00:01:00.000Z')
      const thirdAttempt = new Date('2026-05-14T00:02:00.000Z')
      const afterLockExpiresAttempt = new Date('2026-05-14T00:17:01.000Z')

      await repository.recordLoginFailureBucket({
        username: 'lock-expired-user',
        now: firstAttempt,
        maxAttempts: 3,
        windowSeconds: 900,
        lockSeconds: 900,
      })
      await repository.recordLoginFailureBucket({
        username: 'lock-expired-user',
        now: secondAttempt,
        maxAttempts: 3,
        windowSeconds: 900,
        lockSeconds: 900,
      })
      await repository.recordLoginFailureBucket({
        username: 'lock-expired-user',
        now: thirdAttempt,
        maxAttempts: 3,
        windowSeconds: 900,
        lockSeconds: 900,
      })
      await repository.recordLoginFailureBucket({
        username: 'lock-expired-user',
        now: afterLockExpiresAttempt,
        maxAttempts: 3,
        windowSeconds: 900,
        lockSeconds: 900,
      })

      const bucket = await repository.findLoginAttemptBucketByUsername('lock-expired-user')

      expect(bucket).toMatchObject({
        username: 'lock-expired-user',
        failedCount: 1,
        windowStartedAt: afterLockExpiresAttempt,
        lastFailedAt: afterLockExpiresAttempt,
        lockedUntil: null,
      })
    },
  )

  dbTest(
    'keeps active login failure lock when stale write sees expired window',
    async ({ db: database }) => {
      const repository = createAuthRepository(database)
      const firstAttempt = new Date('2026-05-14T00:00:00.000Z')
      const secondAttempt = new Date('2026-05-14T00:01:00.000Z')
      const thirdAttempt = new Date('2026-05-14T00:02:00.000Z')
      const staleAttempt = new Date('2026-05-14T00:16:00.000Z')
      const expectedLockUntil = new Date('2026-05-14T00:17:00.000Z')

      await repository.recordLoginFailureBucket({
        username: 'stale-lock-user',
        now: firstAttempt,
        maxAttempts: 3,
        windowSeconds: 900,
        lockSeconds: 900,
      })
      await repository.recordLoginFailureBucket({
        username: 'stale-lock-user',
        now: secondAttempt,
        maxAttempts: 3,
        windowSeconds: 900,
        lockSeconds: 900,
      })
      await repository.recordLoginFailureBucket({
        username: 'stale-lock-user',
        now: thirdAttempt,
        maxAttempts: 3,
        windowSeconds: 900,
        lockSeconds: 900,
      })
      await repository.recordLoginFailureBucket({
        username: 'stale-lock-user',
        now: staleAttempt,
        maxAttempts: 3,
        windowSeconds: 900,
        lockSeconds: 900,
      })

      const bucket = await repository.findLoginAttemptBucketByUsername('stale-lock-user')

      expect(bucket).toMatchObject({
        username: 'stale-lock-user',
        failedCount: 3,
        windowStartedAt: firstAttempt,
        lastFailedAt: staleAttempt,
        lockedUntil: expectedLockUntil,
      })
    },
  )

  dbTest(
    'keeps active login failure lock when stale successful login cleanup runs',
    async ({ db: database }) => {
      const repository = createAuthRepository(database)
      const firstAttempt = new Date('2026-05-14T00:00:00.000Z')
      const secondAttempt = new Date('2026-05-14T00:01:00.000Z')
      const staleSuccessStartedAt = new Date('2026-05-14T00:01:30.000Z')
      const thirdAttempt = new Date('2026-05-14T00:02:00.000Z')
      const expectedLockUntil = new Date('2026-05-14T00:17:00.000Z')

      await repository.recordLoginFailureBucket({
        username: 'stale-success-lock-user',
        now: firstAttempt,
        maxAttempts: 3,
        windowSeconds: 900,
        lockSeconds: 900,
      })
      await repository.recordLoginFailureBucket({
        username: 'stale-success-lock-user',
        now: secondAttempt,
        maxAttempts: 3,
        windowSeconds: 900,
        lockSeconds: 900,
      })
      await repository.recordLoginFailureBucket({
        username: 'stale-success-lock-user',
        now: thirdAttempt,
        maxAttempts: 3,
        windowSeconds: 900,
        lockSeconds: 900,
      })
      await repository.clearLoginAttemptBucket('stale-success-lock-user', staleSuccessStartedAt)

      const bucket = await repository.findLoginAttemptBucketByUsername('stale-success-lock-user')

      expect(bucket).toMatchObject({
        username: 'stale-success-lock-user',
        failedCount: 3,
        windowStartedAt: firstAttempt,
        lastFailedAt: thirdAttempt,
        lockedUntil: expectedLockUntil,
      })
    },
  )
})
