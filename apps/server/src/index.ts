import 'dotenv/config'
import { serve } from '@hono/node-server'
import { createApp } from './app'
import { db } from './db'

const port = Number(process.env.PORT ?? 3000)
const app = createApp(db)

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`Server listening on http://localhost:${info.port}`)
  },
)
