import { describe, expect, it } from 'vitest'
import { createApp } from '../../app'
import { createTestDb } from '../../test/db'
import { healthRoutes } from './routes'

describe('health routes', () => {
  it('returns health status through the app', async () => {
    const database = await createTestDb()
    const app = createApp(database)
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
