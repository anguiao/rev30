import type { Db } from '../../src/db'
import {
  createApp as createProductionApp,
  type CreateAppOptions as CreateProductionAppOptions,
} from '../../src/app'
import { createScheduledJobRepository } from '../../src/modules/ops/scheduled-jobs/repository'
import { scheduledJobTaskKeys } from '../../src/modules/ops/scheduled-jobs/registry'
import type { ScheduledJobScheduler } from '../../src/modules/ops/scheduled-jobs/scheduler'
import {
  createScheduledJobService,
  type ScheduledJobService,
} from '../../src/modules/ops/scheduled-jobs/service'
import type { OperationLogEventReceiver } from '../../src/runtime/operation-log'
import { createLogger } from '../../src/runtime/logger'

const noopOperationLogReceiver: OperationLogEventReceiver = () => undefined
const scheduledJobDefinitions = scheduledJobTaskKeys.map((key) => ({
  key,
  name: `Definition ${key}`,
  description: `Description ${key}`,
}))

export function createScheduledJobSchedulerStub(): ScheduledJobScheduler {
  return {
    diagnostics: () => ({
      runtimeStatus: 'stopped',
      automaticCapacity: 2,
      automaticRunning: 0,
      manualStarting: 0,
      recoveryQueued: 0,
      retryPending: false,
      nextWakeAt: null,
      lastPollAt: null,
      lastPollStatus: null,
    }),
    start: async () => undefined,
    runManual: async () => {
      throw new Error('Scheduled job test scheduler is not configured')
    },
    requestCancellation: async () => {
      throw new Error('Scheduled job test scheduler is not configured')
    },
    wake: () => undefined,
    stop: async () => undefined,
  }
}

export function createTestScheduledJobService(
  database: Db,
  scheduler: ScheduledJobScheduler = createScheduledJobSchedulerStub(),
) {
  return createScheduledJobService({
    definitions: scheduledJobDefinitions,
    repository: createScheduledJobRepository(database),
    scheduler,
  })
}

export type CreateTestAppOptions = Omit<
  CreateProductionAppOptions,
  'operationLogReceiver' | 'scheduledJobService'
> & {
  operationLogReceiver?: OperationLogEventReceiver
  scheduledJobService?: ScheduledJobService
}

export function createApp(database: Db, options: CreateTestAppOptions = {}) {
  const logger = options.logger ?? createLogger({ level: 'silent' })
  return createProductionApp(database, {
    ...options,
    logger,
    scheduledJobService: options.scheduledJobService ?? createTestScheduledJobService(database),
    operationLogReceiver: options.operationLogReceiver ?? noopOperationLogReceiver,
  })
}
