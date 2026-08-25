import 'dotenv/config'
import { serve } from '@hono/node-server'
import { createApp } from './app'
import { createDb } from './db'
import { startAppMaintenance } from './maintenance'
import { logger } from './runtime/logger'
import { createOperationLogRuntime } from './runtime/operation-log'
import { registerShutdownHandlers } from './runtime/shutdown'
import { readTrustedProxyPolicy } from './runtime/trusted-proxy'

const trustedProxyPolicy = readTrustedProxyPolicy()
const port = Number(process.env.PORT ?? 3000)
const { close: closeDb, db } = await createDb()
const maintenance = startAppMaintenance(db)
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
    operationLog.stop()
    await maintenance.stop()
    await closeDb()
  },
})
