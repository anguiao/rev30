import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LocalAttachmentStorage } from '../../../../src/modules/attachments/storage'
import { opsScheduledJobs } from '../../../../src/db/schema'
import { describe, expect, vi } from 'vitest'
import { systemHealthSnapshotSchema } from '@rev30/contracts'
import { dbTest } from '../../../fixtures/database'
import { createApp } from '../../../helpers/app'
import { createSystemAccessFixture } from '../../../helpers/auth'
import { createHealthTestContext } from './helpers'

describe('system health snapshot HTTP API', () => {
  dbTest('requires an authenticated session and explicit list access', async ({ db }) => {
    const context = createHealthTestContext()
    const snapshot = vi.spyOn(context.service, 'snapshot')
    const app = createApp(db, { systemHealthService: context.service })
    expect((await app.request('/api/ops/system-health')).status).toBe(401)
    const denied = await createSystemAccessFixture(db)
    expect(
      (await app.request('/api/ops/system-health', { headers: denied.authHeaders })).status,
    ).toBe(403)
    expect(snapshot).not.toHaveBeenCalled()
  })

  dbTest(
    'returns a validated no-store snapshot without registering an operation',
    async ({ db }) => {
      const root = await mkdtemp(join(tmpdir(), 'rev30-health-api-'))
      try {
        await db.update(opsScheduledJobs).set({ enabled: false, nextRunAt: null })
        const operationLogReceiver = vi.fn()
        const app = createApp(db, {
          attachmentStorage: new LocalAttachmentStorage(root),
          operationLogReceiver,
        })
        const allowed = await createSystemAccessFixture(db, {
          accessCodes: ['ops:system-health:list'],
        })
        const response = await app.request('/api/ops/system-health', {
          headers: allowed.authHeaders,
        })
        expect(response.status).toBe(200)
        expect(response.headers.get('cache-control')).toBe('no-store')
        expect(response.headers.get('x-request-id')).toBeTruthy()
        expect(systemHealthSnapshotSchema.parse(await response.json())).toMatchObject({
          status: 'degraded',
          issues: ['scheduler_stopped'],
          database: { status: 'healthy' },
          storage: { status: 'healthy', provider: 'local', cached: false },
          scheduler: { shared: { runningCount: 0, overdueCount: 0, oldestOverdueAt: null } },
        })
        expect(operationLogReceiver).not.toHaveBeenCalled()
        expect(await readdir(root)).toEqual([])
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    },
  )

  dbTest('turns contract invariant failures into an unknown safe 500 response', async ({ db }) => {
    const context = createHealthTestContext()
    const malformed = { ...(await context.service.snapshot()), rawError: 'private diagnostic' }
    vi.spyOn(context.service, 'snapshot').mockResolvedValueOnce(malformed)
    const app = createApp(db, { systemHealthService: context.service })
    const allowed = await createSystemAccessFixture(db, { accessCodes: ['ops:system-health:list'] })
    const response = await app.request('/api/ops/system-health', { headers: allowed.authHeaders })
    expect(response.status).toBe(500)
    expect(await response.text()).toBe('Internal Server Error')
  })
})
