import { subMilliseconds } from '@rev30/utils'
import { and, isNotNull, isNull, lte, or } from 'drizzle-orm'
import type { Db } from '../../db'
import { authLoginAttemptBuckets, authRefreshTokens } from '../../db/schema'

export async function cleanupAuthRefreshTokens(
  database: Db,
  revokedRetentionMs: number,
): Promise<number> {
  const now = new Date()
  const revokedCutoff = subMilliseconds(now, revokedRetentionMs)
  const deleted = await database
    .delete(authRefreshTokens)
    .where(
      or(
        lte(authRefreshTokens.expiresAt, now),
        and(
          isNotNull(authRefreshTokens.revokedAt),
          lte(authRefreshTokens.revokedAt, revokedCutoff),
        ),
      ),
    )
    .returning()

  return deleted.length
}

export async function cleanupAuthLoginAttemptBuckets(
  database: Db,
  retentionMs: number,
): Promise<number> {
  const cutoff = subMilliseconds(new Date(), retentionMs)
  const deleted = await database
    .delete(authLoginAttemptBuckets)
    .where(
      or(
        and(
          isNull(authLoginAttemptBuckets.lockedUntil),
          lte(authLoginAttemptBuckets.windowStartedAt, cutoff),
        ),
        and(
          isNotNull(authLoginAttemptBuckets.lockedUntil),
          lte(authLoginAttemptBuckets.lockedUntil, cutoff),
        ),
      ),
    )
    .returning()

  return deleted.length
}
