import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import { healthRoutes } from '../../../src/modules/health/routes'

describe('health routes', () => {
  it('returns health status', async () => {
    const app = new Hono().route('/api', healthRoutes)
    const response = await app.request('/api/health')
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      service: 'rev30-server',
      status: 'ok',
    })
  })
})
