import type { Logger } from 'pino'
import type { Db } from '../../src/db'
import { readAttachmentConfig } from '../../src/modules/attachments/config'
import {
  createAttachmentStorage,
  type AttachmentStorage,
} from '../../src/modules/attachments/storage'
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
import { createSystemHealthRepository } from '../../src/modules/ops/system-health/repository'
import {
  createSystemHealthService,
  type SystemHealthService,
} from '../../src/modules/ops/system-health/service'
import { createSystemHealthStorageProbe } from '../../src/modules/ops/system-health/storage-probe'

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

export function createTestSystemHealthService(
  database: Db,
  storage: AttachmentStorage = createAttachmentStorage(readAttachmentConfig()),
  logger: Logger = createLogger({ level: 'silent' }),
) {
  return createSystemHealthService({
    repository: createSystemHealthRepository(database),
    diagnostics: createScheduledJobSchedulerStub().diagnostics,
    storageProbe: createSystemHealthStorageProbe({ storage, logger }),
    logger,
  })
}

export type CreateTestAppOptions = Omit<
  CreateProductionAppOptions,
  'operationLogReceiver' | 'scheduledJobService' | 'attachmentStorage' | 'systemHealthService'
> & {
  attachmentStorage?: AttachmentStorage
  operationLogReceiver?: OperationLogEventReceiver
  scheduledJobService?: ScheduledJobService
  systemHealthService?: SystemHealthService
}

export function createApp(database: Db, options: CreateTestAppOptions = {}) {
  const storage = options.attachmentStorage ?? createAttachmentStorage(readAttachmentConfig())
  const logger = options.logger ?? createLogger({ level: 'silent' })
  return createProductionApp(database, {
    ...options,
    attachmentStorage: storage,
    systemHealthService:
      options.systemHealthService ?? createTestSystemHealthService(database, storage, logger),
    scheduledJobService: options.scheduledJobService ?? createTestScheduledJobService(database),
    operationLogReceiver: options.operationLogReceiver ?? noopOperationLogReceiver,
  })
}
