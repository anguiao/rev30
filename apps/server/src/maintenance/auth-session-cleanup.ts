import type { Db } from '../db'
import { cleanupAuthSessions } from '../modules/auth/cleanup'
import { logger } from '../runtime/logger'
import type { MaintenanceWorker } from './types'

const defaultSessionCleanupIntervalMs = 6 * 60 * 60 * 1000
const defaultRevokedSessionRetentionMs = 7 * 24 * 60 * 60 * 1000
const MAX_TIMER_DELAY_MS = 2 ** 31 - 1

function readSessionCleanupIntervalMs() {
  const value = Number(
    process.env.AUTH_SESSION_CLEANUP_INTERVAL_MS ?? defaultSessionCleanupIntervalMs,
  )

  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_TIMER_DELAY_MS) {
    throw new Error(`AUTH_SESSION_CLEANUP_INTERVAL_MS 必须是 0 或正整数毫秒值`)
  }

  return value
}

function readRevokedSessionRetentionMs() {
  const value = Number(
    process.env.AUTH_REVOKED_SESSION_RETENTION_MS ?? defaultRevokedSessionRetentionMs,
  )

  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`AUTH_REVOKED_SESSION_RETENTION_MS 必须是 0 或正整数毫秒值`)
  }

  return value
}

export function startAuthSessionCleanup(database: Db): MaintenanceWorker {
  const intervalMs = readSessionCleanupIntervalMs()
  const revokedRetentionMs = readRevokedSessionRetentionMs()

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
      const deletedCount = await cleanupAuthSessions(database, revokedRetentionMs)

      if (deletedCount > 0) {
        logger.info({ deletedCount }, 'auth session cleanup completed')
      }
    } catch (error) {
      if (!stopped) {
        logger.error({ err: error }, 'auth session cleanup failed')
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
