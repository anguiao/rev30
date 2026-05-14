import type { Db } from '../index'
import { startAuthRefreshTokenCleanup } from './refresh-token-cleanup'
import { startAuthLoginAttemptCleanup } from './login-attempt-cleanup'
import type { MaintenanceWorker } from './types'

export type DbMaintenance = {
  stop: () => Promise<void>
}

export function startDbMaintenance(database: Db): DbMaintenance {
  const workers: MaintenanceWorker[] = []

  try {
    workers.push(startAuthRefreshTokenCleanup(database))
    workers.push(startAuthLoginAttemptCleanup(database))
  } catch (error) {
    for (const worker of workers) {
      worker.stop()
    }

    throw error
  }

  return {
    async stop() {
      await Promise.all(workers.map((worker) => worker.stop()))
    },
  }
}
