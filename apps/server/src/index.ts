import 'dotenv/config'
import { serve } from '@hono/node-server'
import { createApp } from './app'
import { createDb } from './db'
import { readScheduledJobRetentionConfig } from './modules/ops/scheduled-jobs/config'
import { createProductionScheduledJobRuntime } from './modules/ops/scheduled-jobs/runtime'
import { createAttachmentStorage } from './modules/attachments/storage'
import { readAttachmentConfig } from './modules/attachments/config'
import { logger } from './runtime/logger'
import { createOperationLogRuntime } from './runtime/operation-log'
import { registerShutdownHandlers } from './runtime/shutdown'
import { readTrustedProxyPolicy } from './runtime/trusted-proxy'

const trustedProxyPolicy = readTrustedProxyPolicy()
const port = Number(process.env.PORT ?? 3000)
const { close: closeDb, db } = await createDb()

async function startScheduledJobs() {
  try {
    const scheduledJobs = createProductionScheduledJobRuntime({
      database: db,
      logger,
      storage: createAttachmentStorage(readAttachmentConfig()),
      retention: readScheduledJobRetentionConfig(),
    })
    await scheduledJobs.start()
    return scheduledJobs
  } catch (error) {
    await closeDb()
    throw error
  }
}

const scheduledJobs = await startScheduledJobs()
const operationLog = createOperationLogRuntime(db, logger)
const app = createApp(db, {
  logger,
  operationLogReceiver: operationLog.receiver,
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

registerShutdownHandlers({
  server,
  cleanup: async () => {
    await scheduledJobs.stop()
    operationLog.stop()
    await closeDb()
  },
})
