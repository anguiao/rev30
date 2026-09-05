import { Hono } from 'hono'
import type { Db } from '../../db'
import { checkReadiness } from './service'

export function createHealthRoutes(database: Db) {
  return new Hono()
    .get('/health/live', (c) => {
      c.header('Cache-Control', 'no-store')
      return c.json({ service: 'rev30-server', status: 'alive' } as const)
    })
    .get('/health/ready', async (c) => {
      c.header('Cache-Control', 'no-store')
      try {
        await checkReadiness(database)
      } catch {
        return c.json({ service: 'rev30-server', status: 'not_ready' } as const, 503)
      }
      return c.json({ service: 'rev30-server', status: 'ready' } as const)
    })
}
