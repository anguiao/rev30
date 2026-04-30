import 'dotenv/config'
import { serve } from '@hono/node-server'
import { createApp } from './app'
import { createDb } from './db'

const port = Number(process.env.PORT ?? 3000)
const db = await createDb()
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
