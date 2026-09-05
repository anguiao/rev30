import 'dotenv/config'
import { serve } from '@hono/node-server'
import { createApp } from './app'
import { createDb } from './db'
import { readAttachmentConfig } from './modules/attachments/config'
import { createAttachmentStorage } from './modules/attachments/storage'
import { readScheduledJobRetentionConfig } from './modules/ops/scheduled-jobs/config'
import { startScheduledJobs } from './modules/ops/scheduled-jobs/startup'
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
const operationLog = createOperationLogRuntime(db, logger)

const app = createApp(db, {
  logger,
  operationLogReceiver: operationLog.receiver,
  scheduledJobService: scheduledJobs.service,
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
