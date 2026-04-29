import { Hono } from 'hono'

export const apiContract = new Hono().get('/health', (c) =>
  c.json({
    service: 'rev30-server',
    status: 'ok',
  } as const),
)

export type AppType = typeof apiContract
