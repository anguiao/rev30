import type { Db } from '../db'
import { cleanupLoginLogs } from '../modules/ops/login-logs/cleanup'
import { logger } from '../runtime/logger'
import type { MaintenanceWorker } from './types'

const defaultLoginLogCleanupIntervalMs = 6 * 60 * 60 * 1000
const defaultLoginLogRetentionMs = 90 * 24 * 60 * 60 * 1000
const MAX_TIMER_DELAY_MS = 2 ** 31 - 1

function readLoginLogCleanupIntervalMs() {
  const value = Number(
    process.env.OPS_LOGIN_LOG_CLEANUP_INTERVAL_MS ?? defaultLoginLogCleanupIntervalMs,
  )

  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_TIMER_DELAY_MS) {
    throw new Error(`OPS_LOGIN_LOG_CLEANUP_INTERVAL_MS 必须是 0 或正整数毫秒值`)
  }

  return value
}

function readLoginLogRetentionMs() {
  const value = Number(process.env.OPS_LOGIN_LOG_RETENTION_MS ?? defaultLoginLogRetentionMs)

  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`OPS_LOGIN_LOG_RETENTION_MS 必须是 0 或正整数毫秒值`)
  }

  return value
}

export function startOpsLoginLogCleanup(database: Db): MaintenanceWorker {
  const intervalMs = readLoginLogCleanupIntervalMs()
  const retentionMs = readLoginLogRetentionMs()

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
      const deletedCount = await cleanupLoginLogs(database, retentionMs)

      if (deletedCount > 0) {
        logger.info({ deletedCount }, 'ops login log cleanup completed')
      }
    } catch (error) {
      if (!stopped) {
        logger.error({ err: error }, 'ops login log cleanup failed')
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
