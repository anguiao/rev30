import 'dotenv/config'
import { serve } from '@hono/node-server'
import { createApp } from './app'
import { createDb } from './db'
import { startAppMaintenance } from './maintenance'
import { createOperationAuditBuffer } from './modules/ops/operation-logs/buffer'
import { createOperationAuditWriter } from './modules/ops/operation-logs/writer'
import { logger } from './runtime/logger'
import { registerShutdownHandlers } from './runtime/shutdown'
import { readTrustedProxyPolicy } from './runtime/trusted-proxy'

const trustedProxyPolicy = readTrustedProxyPolicy()
const port = Number(process.env.PORT ?? 3000)
const { close: closeDb, db } = await createDb()
const maintenance = startAppMaintenance(db)
const operationAuditBuffer = createOperationAuditBuffer({
  logger,
  writer: createOperationAuditWriter(db),
})
const app = createApp(db, {
  logger,
  operationAuditSink: operationAuditBuffer,
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
    operationAuditBuffer.stop()
    await maintenance.stop()
    await closeDb()
  },
})
