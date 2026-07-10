import type { Db } from '../db'
import {
  cleanupOrphanedAttachmentUploads,
  cleanupUnreferencedAttachments,
} from '../modules/attachments/cleanup'
import { readAttachmentConfig } from '../modules/attachments/config'
import { createAttachmentStorage } from '../modules/attachments/storage'
import { logger } from '../runtime/logger'
import type { MaintenanceWorker } from './types'

const defaultAttachmentCleanupIntervalMs = 6 * 60 * 60 * 1000
const defaultAttachmentCleanupRetentionMs = 7 * 24 * 60 * 60 * 1000
const maxTimerDelayMs = 2 ** 31 - 1

function readAttachmentCleanupIntervalMs() {
  const value = Number(
    process.env.ATTACHMENT_CLEANUP_INTERVAL_MS ?? defaultAttachmentCleanupIntervalMs,
  )

  if (!Number.isInteger(value) || value < 0 || value > maxTimerDelayMs) {
    throw new Error(`ATTACHMENT_CLEANUP_INTERVAL_MS 必须是 0 或正整数毫秒值`)
  }

  return value
}

function readAttachmentCleanupRetentionMs() {
  const value = Number(
    process.env.ATTACHMENT_CLEANUP_RETENTION_MS ?? defaultAttachmentCleanupRetentionMs,
  )

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`ATTACHMENT_CLEANUP_RETENTION_MS 必须是正整数毫秒值`)
  }

  return value
}

export function startAttachmentCleanup(database: Db): MaintenanceWorker {
  const intervalMs = readAttachmentCleanupIntervalMs()
  const retentionMs = readAttachmentCleanupRetentionMs()
  const storage = createAttachmentStorage(readAttachmentConfig())

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
      const deletedCount = await cleanupOrphanedAttachmentUploads(database, storage, retentionMs)

      if (deletedCount > 0) {
        logger.info({ deletedCount }, 'orphaned attachment upload cleanup completed')
      }
    } catch (error) {
      if (!stopped) {
        logger.error({ error }, 'orphaned attachment upload cleanup failed')
      }
    }

    try {
      const deletedCount = await cleanupUnreferencedAttachments(database, storage, retentionMs)

      if (deletedCount > 0) {
        logger.info({ deletedCount }, 'unreferenced attachment cleanup completed')
      }
    } catch (error) {
      if (!stopped) {
        logger.error({ error }, 'unreferenced attachment cleanup failed')
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
