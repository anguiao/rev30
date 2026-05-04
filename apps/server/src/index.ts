import 'dotenv/config'
import { serve } from '@hono/node-server'
import { createApp } from './app'
import { createDb } from './db'
import { logger } from './logger'

const port = Number(process.env.PORT ?? 3000)
const db = await createDb()
const app = createApp(db)

serve(
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
