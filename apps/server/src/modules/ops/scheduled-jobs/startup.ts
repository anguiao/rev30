import { randomUUID } from 'node:crypto'
import type { Logger } from 'pino'
import type { Db } from '../../../db'
import type { AttachmentStorage } from '../../attachments/storage'
import type { ScheduledJobRetentionConfig } from './config'
import { createScheduledJobDefinitions } from './definitions'
import { createScheduledJobRepository } from './repository'
import { createScheduledJobRegistry } from './registry'
import { createScheduledJobRunner } from './runner'
import { createScheduledJobScheduler } from './scheduler'
import { createScheduledJobService } from './service'

type StartScheduledJobsOptions = {
  database: Db
  logger: Logger
  storage: AttachmentStorage
  retention: ScheduledJobRetentionConfig
}

export async function startScheduledJobs(options: StartScheduledJobsOptions) {
  const repository = createScheduledJobRepository(options.database)
  const definitions = createScheduledJobDefinitions({
    database: options.database,
    storage: options.storage,
    retention: options.retention,
  })
  const registry = createScheduledJobRegistry(definitions)
  const executorId = randomUUID()
  const runner = createScheduledJobRunner({
    executorId,
    logger: options.logger,
    registry,
    repository,
  })
  const scheduler = createScheduledJobScheduler({
    executorId,
    logger: options.logger,
    repository,
    runner,
  })
  const initialized = await repository.initialize({
    taskKeys: registry.keys(),
    startupAt: new Date(),
  })
  for (const interrupted of initialized.interruptedRuns) {
    options.logger.info(
      {
        taskKey: interrupted.taskKey,
        runId: interrupted.runId,
        triggerSource: interrupted.triggerSource,
      },
      'scheduled job interrupted during startup recovery',
    )
  }
  scheduler.start(initialized.recoverableRuns)

  const service = createScheduledJobService({ definitions, repository, scheduler })

  return {
    service,
    stop: () => scheduler.stop(),
  }
}
