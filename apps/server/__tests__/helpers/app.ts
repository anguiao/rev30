import type { Db } from '../../src/db'
import {
  createApp as createProductionApp,
  type CreateAppOptions as CreateProductionAppOptions,
} from '../../src/app'
import type { ScheduledJobRuntimeCommands } from '../../src/modules/ops/scheduled-jobs/runtime'
import { scheduledJobTaskKeys } from '../../src/modules/ops/scheduled-jobs/registry'
import type { OperationLogEventReceiver } from '../../src/runtime/operation-log'

const noopOperationLogReceiver: OperationLogEventReceiver = () => undefined

export function createScheduledJobRuntimeStub(): ScheduledJobRuntimeCommands {
  const definitions = scheduledJobTaskKeys.map((key) => ({
    key,
    name: key,
    description: key,
  }))

  return {
    listDefinitions: () => definitions,
    runManual: async () => {
      throw new Error('Scheduled job test runtime is not accepting new work')
    },
    requestCancellation: async () => {
      throw new Error('Scheduled job test runtime is not accepting new work')
    },
    wake: () => undefined,
  }
}

export type CreateTestAppOptions = Omit<
  CreateProductionAppOptions,
  'operationLogReceiver' | 'scheduledJobs'
> & {
  operationLogReceiver?: OperationLogEventReceiver
  scheduledJobs?: ScheduledJobRuntimeCommands
}

export function createApp(database: Db, options: CreateTestAppOptions = {}) {
  return createProductionApp(database, {
    ...options,
    scheduledJobs: options.scheduledJobs ?? createScheduledJobRuntimeStub(),
    operationLogReceiver: options.operationLogReceiver ?? noopOperationLogReceiver,
  })
}
