import { and, isNotNull, lte, or } from 'drizzle-orm'
import { logger } from '../../runtime/logger'
import type { Db } from '../index'
import { authRefreshTokens } from '../schema'
import type { MaintenanceWorker } from './types'

const defaultRefreshTokenCleanupIntervalMs = 6 * 60 * 60 * 1000
const defaultRevokedRefreshTokenRetentionMs = 7 * 24 * 60 * 60 * 1000
const maxTimerDelayMs = 2 ** 31 - 1

function readRefreshTokenCleanupIntervalMs() {
  const value = Number(
    process.env.AUTH_REFRESH_TOKEN_CLEANUP_INTERVAL_MS ?? defaultRefreshTokenCleanupIntervalMs,
  )

  if (!Number.isInteger(value) || value < 0 || value > maxTimerDelayMs) {
    throw new Error(`AUTH_REFRESH_TOKEN_CLEANUP_INTERVAL_MS 必须是 0 或正整数毫秒值`)
  }

  return value
}

function readRevokedRefreshTokenRetentionMs() {
  const value = Number(
    process.env.AUTH_REVOKED_REFRESH_TOKEN_RETENTION_MS ?? defaultRevokedRefreshTokenRetentionMs,
  )

  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`AUTH_REVOKED_REFRESH_TOKEN_RETENTION_MS 必须是 0 或正整数毫秒值`)
  }

  return value
}

export async function cleanupAuthRefreshTokens(
  database: Db,
  revokedRetentionMs: number,
): Promise<number> {
  const now = new Date()
  const revokedCutoff = new Date(now.getTime() - revokedRetentionMs)
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

export function startAuthRefreshTokenCleanup(database: Db): MaintenanceWorker {
  const intervalMs = readRefreshTokenCleanupIntervalMs()
  const revokedRetentionMs = readRevokedRefreshTokenRetentionMs()

  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let currentRun: Promise<void> | null = null

  function scheduleNext(delayMs: number) {
    if (stopped || intervalMs <= 0) {
      return
    }

    timer = setTimeout(() => {
      timer = null
      currentRun = run().finally(() => {
        currentRun = null
      })
    }, delayMs)
    timer.unref()
  }

  async function run() {
    if (stopped) {
      return
    }

    try {
      const deletedCount = await cleanupAuthRefreshTokens(database, revokedRetentionMs)

      if (deletedCount > 0) {
        logger.info(
          {
            deletedCount,
          },
          'auth refresh token cleanup completed',
        )
      }
    } catch (error) {
      if (!stopped) {
        logger.error({ error }, 'auth refresh token cleanup failed')
      }
    }

    scheduleNext(intervalMs)
  }

  scheduleNext(0)

  return {
    async stop() {
      stopped = true

      if (timer) {
        clearTimeout(timer)
        timer = null
      }

      await currentRun
    },
  }
}
