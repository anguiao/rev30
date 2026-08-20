import type { Db } from '../db'
import { cleanupOperationLogs } from '../modules/ops/operation-logs/cleanup'
import { logger } from '../runtime/logger'
import type { MaintenanceWorker } from './types'

const defaultOperationLogCleanupIntervalMs = 6 * 60 * 60 * 1000
const defaultOperationLogRetentionMs = 180 * 24 * 60 * 60 * 1000
const MAX_TIMER_DELAY_MS = 2 ** 31 - 1

function readOperationLogCleanupIntervalMs() {
  const value = Number(
    process.env.OPS_OPERATION_LOG_CLEANUP_INTERVAL_MS ?? defaultOperationLogCleanupIntervalMs,
  )

  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_TIMER_DELAY_MS) {
    throw new Error(`OPS_OPERATION_LOG_CLEANUP_INTERVAL_MS 必须是 0 或正整数毫秒值`)
  }

  return value
}

function readOperationLogRetentionMs() {
  const value = Number(process.env.OPS_OPERATION_LOG_RETENTION_MS ?? defaultOperationLogRetentionMs)

  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`OPS_OPERATION_LOG_RETENTION_MS 必须是 0 或正整数毫秒值`)
  }

  return value
}

export function startOpsOperationLogCleanup(database: Db): MaintenanceWorker {
  const intervalMs = readOperationLogCleanupIntervalMs()
  const retentionMs = readOperationLogRetentionMs()

  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let currentRun: Promise<void> | null = null

  function scheduleNext(delayMs: number) {
    if (stopped || intervalMs === 0) {
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
      const deletedCount = await cleanupOperationLogs(database, retentionMs)

      if (deletedCount > 0) {
        logger.info({ deletedCount }, 'ops operation log cleanup completed')
      }
    } catch (error) {
      if (!stopped) {
        logger.error({ err: error }, 'ops operation log cleanup failed')
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
