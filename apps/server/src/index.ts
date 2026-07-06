import 'dotenv/config'
import { serve } from '@hono/node-server'
import { createApp } from './app'
import { createDb } from './db'
import { startAppMaintenance } from './maintenance'
import { logger } from './runtime/logger'
import { registerShutdownHandlers } from './runtime/shutdown'

const port = Number(process.env.PORT ?? 3000)
const { close: closeDb, db } = await createDb()
const maintenance = startAppMaintenance(db)
const app = createApp(db)

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
    await maintenance.stop()
    await closeDb()
  },
})
