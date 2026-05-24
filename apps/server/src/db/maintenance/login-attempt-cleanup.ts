import { and, isNotNull, isNull, lte, or } from 'drizzle-orm'
import { logger } from '../../runtime/logger'
import type { Db } from '../index'
import { authLoginAttemptBuckets } from '../schema'
import type { MaintenanceWorker } from './types'

const defaultLoginAttemptCleanupIntervalMs = 6 * 60 * 60 * 1000
const defaultLoginAttemptRetentionMs = 24 * 60 * 60 * 1000
const maxTimerDelayMs = 2 ** 31 - 1

function readLoginAttemptCleanupIntervalMs() {
  const value = Number(
    process.env.AUTH_LOGIN_ATTEMPT_CLEANUP_INTERVAL_MS ?? defaultLoginAttemptCleanupIntervalMs,
  )

  if (!Number.isInteger(value) || value < 0 || value > maxTimerDelayMs) {
    throw new Error(`AUTH_LOGIN_ATTEMPT_CLEANUP_INTERVAL_MS 必须是 0 或正整数毫秒值`)
  }

  return value
}

function readLoginAttemptRetentionMs() {
  const value = Number(
    process.env.AUTH_LOGIN_ATTEMPT_RETENTION_MS ?? defaultLoginAttemptRetentionMs,
  )

  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`AUTH_LOGIN_ATTEMPT_RETENTION_MS 必须是 0 或正整数毫秒值`)
  }

  return value
}

export async function cleanupAuthLoginAttemptBuckets(
  database: Db,
  retentionMs: number,
): Promise<number> {
  const cutoff = new Date(Date.now() - retentionMs)
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

export function startAuthLoginAttemptCleanup(database: Db): MaintenanceWorker {
  const intervalMs = readLoginAttemptCleanupIntervalMs()
  const retentionMs = readLoginAttemptRetentionMs()

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
      const deletedCount = await cleanupAuthLoginAttemptBuckets(database, retentionMs)

      if (deletedCount > 0) {
        logger.info(
          {
            deletedCount,
          },
          'auth login attempt cleanup completed',
        )
      }
    } catch (error) {
      if (!stopped) {
        logger.error({ error }, 'auth login attempt cleanup failed')
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
