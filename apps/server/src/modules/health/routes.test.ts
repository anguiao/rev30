import { describe, expect, it } from 'vitest'
import { app } from '../../app'
import { healthRoutes } from './routes'

describe('health routes', () => {
  it('returns health status through the app', async () => {
    const response = await app.request('/api/health')
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      service: 'rev30-server',
      status: 'ok',
    })
  })

  it('keeps health route implementation inside the health module', async () => {
    const response = await healthRoutes.request('/health')
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      service: 'rev30-server',
      status: 'ok',
    })
  })
})
