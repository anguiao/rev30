import 'dotenv/config'
import { serve } from '@hono/node-server'
import { createApp } from './app'
import { createManagedDb } from './db'
import { logger } from './logger'

const port = Number(process.env.PORT ?? 3000)
const { close: closeDb, db } = await createManagedDb()
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

async function shutdown(signal: NodeJS.Signals) {
  logger.info({ signal }, 'server shutting down')

  server.close(async (error) => {
    await closeDb()

    if (error) {
      logger.error({ error, signal }, 'server shutdown failed')
      process.exit(1)
    }

    logger.info({ signal }, 'server stopped')
    process.exit(0)
  })
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void shutdown(signal)
  })
}
