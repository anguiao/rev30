import type { Db } from '../db'
import { startAttachmentCleanup } from './attachment-cleanup'
import { startAuthLoginAttemptCleanup } from './auth-login-attempt-cleanup'
import { startAuthRefreshTokenCleanup } from './auth-refresh-token-cleanup'
import type { MaintenanceWorker } from './types'

export type AppMaintenance = {
  stop: () => Promise<void>
}

export function startAppMaintenance(database: Db): AppMaintenance {
  const workers: MaintenanceWorker[] = []

  try {
    workers.push(startAuthRefreshTokenCleanup(database))
    workers.push(startAuthLoginAttemptCleanup(database))
    workers.push(startAttachmentCleanup(database))
  } catch (error) {
    for (const worker of workers) {
      void worker.stop()
    }

    throw error
  }

  return {
    async stop() {
      await Promise.all(workers.map((worker) => worker.stop()))
    },
  }
}
