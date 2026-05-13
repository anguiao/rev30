import type { Db } from '../index'
import { startAuthRefreshTokenCleanup } from './refresh-token-cleanup'
import type { MaintenanceWorker } from './types'

export type DbMaintenance = {
  stop: () => Promise<void>
}

export function startDbMaintenance(database: Db): DbMaintenance {
  const workers: MaintenanceWorker[] = [startAuthRefreshTokenCleanup(database)]

  return {
    async stop() {
      await Promise.all(workers.map((worker) => worker.stop()))
    },
  }
}
