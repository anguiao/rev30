import 'dotenv/config'
import { serve } from '@hono/node-server'
import { createApp } from './app'
import { createDb } from './db'
import { readAttachmentConfig } from './modules/attachments/config'
import { createAttachmentStorage } from './modules/attachments/storage'
import { readScheduledJobRetentionConfig } from './modules/ops/scheduled-jobs/config'
import { startScheduledJobs } from './modules/ops/scheduled-jobs/startup'
import { createSystemHealthRepository } from './modules/ops/system-health/repository'
import { createSystemHealthService } from './modules/ops/system-health/service'
import { createSystemHealthStorageProbe } from './modules/ops/system-health/storage-probe'
import { logger } from './runtime/logger'
import { createOperationLogRuntime } from './runtime/operation-log'
import { closeServer, registerShutdownHandlers } from './runtime/shutdown'
import { readTrustedProxyPolicy } from './runtime/trusted-proxy'

const port = Number(process.env.PORT ?? 3000)
const { close: closeDb, db } = await createDb()

const trustedProxyPolicy = readTrustedProxyPolicy()
const attachmentStorage = createAttachmentStorage(readAttachmentConfig())
const scheduledJobRetention = readScheduledJobRetentionConfig()
const scheduledJobs = await startScheduledJobs({
  database: db,
  logger,
  storage: attachmentStorage,
  retention: scheduledJobRetention,
})
const systemHealthService = createSystemHealthService({
  repository: createSystemHealthRepository(db),
  diagnostics: scheduledJobs.diagnostics,
  taskCatalog: scheduledJobs.taskCatalog,
  storageProbe: createSystemHealthStorageProbe({ storage: attachmentStorage, logger }),
  logger,
})
const operationLog = createOperationLogRuntime(db, logger)

const app = createApp(db, {
  attachmentStorage,
  logger,
  operationLogReceiver: operationLog.receiver,
  scheduledJobService: scheduledJobs.service,
  systemHealthService,
  trustedProxyPolicy,
})

const server = serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    logger.info(
      {
        port: info.port,
        url: `http://localhost:${info.port}`,
      },
      'server listening',
    )
  },
)

registerShutdownHandlers(async () => {
  const results = await Promise.allSettled([closeServer(server), scheduledJobs.stop()])
  operationLog.stop()
  await closeDb()

  for (const result of results) {
    if (result.status === 'rejected') throw result.reason
  }
})
