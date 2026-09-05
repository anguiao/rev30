import { afterEach, describe, expect, vi } from 'vitest'
import { Hono } from 'hono'
import type { Db } from '../../../src/db'
import { createHealthRoutes } from '../../../src/modules/health/routes'
import { dbTest } from '../../fixtures/database'

function setup(database: Db) {
  const execute = vi.spyOn(database, 'execute')
  return { execute, app: new Hono().route('/api', createHealthRoutes(database)) }
}

afterEach(() => vi.restoreAllMocks())

describe('health routes', () => {
  dbTest('responds to liveness without calling any dependency check', async ({ db }) => {
    const { app, execute } = setup(db)
    const response = await app.request('/api/health/live')
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ service: 'rev30-server', status: 'alive' })
    expect(execute).not.toHaveBeenCalled()
  })

  dbTest('responds ready only after the database check succeeds', async ({ db }) => {
    const { app, execute } = setup(db)
    const response = await app.request('/api/health/ready')
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ service: 'rev30-server', status: 'ready' })
    expect(execute).toHaveBeenCalledOnce()
  })

  dbTest(
    'maps database failures to a minimal 503 without disclosing diagnostics',
    async ({ db }) => {
      const { app, execute } = setup(db)
      execute.mockRejectedValueOnce(new Error('postgres://user:secret@private-host:5432/rev30'))
      const response = await app.request('/api/health/ready')
      expect(response.status).toBe(503)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(await response.json()).toEqual({ service: 'rev30-server', status: 'not_ready' })
    },
  )
})
