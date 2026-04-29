import { Hono } from 'hono'

export const healthRoutes = new Hono().get('/health', (c) =>
  c.json({
    service: 'rev30-server',
    status: 'ok',
  } as const),
)
