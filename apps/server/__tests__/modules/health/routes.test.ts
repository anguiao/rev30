import { describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import { createHealthRoutes } from '../../../src/modules/health/routes'

function setup() {
  const probeDatabase = vi.fn<() => Promise<void>>(async () => undefined)
  return { probeDatabase, app: new Hono().route('/api', createHealthRoutes(probeDatabase)) }
}

describe('health routes', () => {
  it('responds to liveness without calling any dependency probe', async () => {
    const { app, probeDatabase } = setup()
    const response = await app.request('/api/health/live')
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ service: 'rev30-server', status: 'alive' })
    expect(probeDatabase).not.toHaveBeenCalled()
  })

  it('responds ready only after the database probe succeeds', async () => {
    const { app, probeDatabase } = setup()
    const response = await app.request('/api/health/ready')
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ service: 'rev30-server', status: 'ready' })
    expect(probeDatabase).toHaveBeenCalledExactlyOnceWith()
  })

  it('maps database failures to a minimal 503 without disclosing diagnostics', async () => {
    const { app, probeDatabase } = setup()
    probeDatabase.mockRejectedValueOnce(new Error('postgres://user:secret@private-host:5432/rev30'))
    const response = await app.request('/api/health/ready')
    expect(response.status).toBe(503)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ service: 'rev30-server', status: 'not_ready' })
  })
})
