import { Hono } from 'hono'

export function createHealthRoutes(probeDatabase: () => Promise<void>) {
  return new Hono()
    .get('/health/live', (c) => {
      c.header('Cache-Control', 'no-store')
      return c.json({ service: 'rev30-server', status: 'alive' } as const)
    })
    .get('/health/ready', async (c) => {
      c.header('Cache-Control', 'no-store')
      try {
        await probeDatabase()
      } catch {
        return c.json({ service: 'rev30-server', status: 'not_ready' } as const, 503)
      }
      return c.json({ service: 'rev30-server', status: 'ready' } as const)
    })
}
