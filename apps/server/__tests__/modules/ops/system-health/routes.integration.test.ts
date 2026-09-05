import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LocalAttachmentStorage } from '../../../../src/modules/attachments/storage'
import { opsScheduledJobs } from '../../../../src/db/schema'
import { afterEach, describe, expect, vi } from 'vitest'
import { systemHealthJobStatisticsSchema, systemHealthSnapshotSchema } from '@rev30/contracts'
import { dbTest } from '../../../fixtures/database'
import {
  createApp,
  createScheduledJobSchedulerStub,
  createTestScheduledJobService,
} from '../../../helpers/app'
import { createSystemAccessFixture } from '../../../helpers/auth'
import { createLogger } from '../../../../src/runtime/logger'
import * as systemHealthRepository from '../../../../src/modules/ops/system-health/repository'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('system health snapshot HTTP API', () => {
  dbTest('logs health check failures with the current request ID', async ({ db }) => {
    const write = vi.fn<(message: string) => void>()
    const logger = createLogger({ level: 'error', destination: { write } })
    const app = createApp(db, { logger })
    const allowed = await createSystemAccessFixture(db, { accessCodes: ['ops:system-health:list'] })
    vi.spyOn(db, 'execute').mockRejectedValueOnce(new Error('database unavailable'))
    vi.spyOn(LocalAttachmentStorage.prototype, 'checkHealth').mockRejectedValueOnce(
      new Error('storage unavailable'),
    )

    const response = await app.request('/api/ops/system-health', { headers: allowed.authHeaders })
    expect(response.status).toBe(200)
    const requestId = response.headers.get('x-request-id')
    expect(requestId).toBeTruthy()
    expect(write).toHaveBeenCalledTimes(2)
    expect(write.mock.calls.map(([line]) => JSON.parse(line) as unknown)).toEqual(
      expect.arrayContaining(
        ['database', 'storage'].map((component) =>
          expect.objectContaining({ component, requestId, msg: 'system health check failed' }),
        ),
      ),
    )
  })

  dbTest('returns an unknown safe 500 when statistics cannot be read', async ({ db }) => {
    const repository = systemHealthRepository.createSystemHealthRepository(db)
    const error = new Error('private query')
    const readStatistics = vi.spyOn(repository, 'readJobStatistics').mockRejectedValueOnce(error)
    vi.spyOn(systemHealthRepository, 'createSystemHealthRepository').mockReturnValueOnce(repository)
    const logger = createLogger({ level: 'silent' })
    const logError = vi.spyOn(logger, 'error')
    const app = createApp(db, { logger })
    const allowed = await createSystemAccessFixture(db, { accessCodes: ['ops:system-health:list'] })
    const response = await app.request('/api/ops/system-health/job-statistics', {
      headers: allowed.authHeaders,
    })
    expect(response.status).toBe(500)
    expect(await response.text()).toBe('Internal Server Error')
    expect(readStatistics).toHaveBeenCalledTimes(1)
    expect(logError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ status: 500, err: error }),
      'request failed',
    )
  })

  dbTest('requires an authenticated session and explicit list access', async ({ db }) => {
    const repository = systemHealthRepository.createSystemHealthRepository(db)
    const readStatistics = vi.spyOn(repository, 'readJobStatistics')
    vi.spyOn(systemHealthRepository, 'createSystemHealthRepository').mockReturnValueOnce(repository)
    const scheduledJobService = createTestScheduledJobService(db)
    const diagnostics = vi.spyOn(scheduledJobService, 'diagnostics')
    const app = createApp(db, { scheduledJobService })
    expect((await app.request('/api/ops/system-health')).status).toBe(401)
    const denied = await createSystemAccessFixture(db)
    expect(
      (await app.request('/api/ops/system-health', { headers: denied.authHeaders })).status,
    ).toBe(403)
    expect((await app.request('/api/ops/system-health/job-statistics')).status).toBe(401)
    expect(
      (await app.request('/api/ops/system-health/job-statistics', { headers: denied.authHeaders }))
        .status,
    ).toBe(403)
    expect(diagnostics).not.toHaveBeenCalled()
    expect(readStatistics).not.toHaveBeenCalled()
  })

  dbTest(
    'returns a validated no-store snapshot without registering an operation',
    async ({ db }) => {
      const root = await mkdtemp(join(tmpdir(), 'rev30-health-api-'))
      try {
        await db.update(opsScheduledJobs).set({ enabled: false, nextRunAt: null })
        const operationLogReceiver = vi.fn()
        vi.stubEnv('ATTACHMENT_STORAGE_DIR', root)
        const checkHealth = vi.spyOn(LocalAttachmentStorage.prototype, 'checkHealth')
        const scheduler = createScheduledJobSchedulerStub()
        const runningDiagnostics = { ...scheduler.diagnostics(), runtimeStatus: 'running' as const }
        const diagnostics = vi.spyOn(scheduler, 'diagnostics')
        const app = createApp(db, {
          operationLogReceiver,
          scheduledJobService: createTestScheduledJobService(db, scheduler),
        })
        expect(checkHealth).not.toHaveBeenCalled()
        const allowed = await createSystemAccessFixture(db, {
          accessCodes: ['ops:system-health:list'],
        })
        const response = await app.request('/api/ops/system-health', {
          headers: allowed.authHeaders,
        })
        expect(response.status).toBe(200)
        expect(response.headers.get('cache-control')).toBe('no-store')
        expect(response.headers.get('x-request-id')).toBeTruthy()
        const snapshot = systemHealthSnapshotSchema.parse(await response.json())
        expect(snapshot).toMatchObject({
          status: 'degraded',
          issues: ['scheduler_stopped'],
          database: { status: 'healthy' },
          storage: { status: 'healthy', provider: 'local', cached: false },
          scheduler: { shared: { runningCount: 0, overdueCount: 0, oldestOverdueAt: null } },
        })
        diagnostics.mockReturnValueOnce(runningDiagnostics)
        const nextResponse = await app.request('/api/ops/system-health', {
          headers: allowed.authHeaders,
        })
        expect(nextResponse.status).toBe(200)
        expect(systemHealthSnapshotSchema.parse(await nextResponse.json())).toMatchObject({
          status: 'healthy',
          issues: [],
          instance: { startedAt: snapshot.instance.startedAt },
          storage: { ...snapshot.storage, cached: true },
          scheduler: { runtimeStatus: 'running' },
        })
        expect(checkHealth).toHaveBeenCalledTimes(1)
        const statisticsResponse = await app.request('/api/ops/system-health/job-statistics', {
          headers: allowed.authHeaders,
        })
        expect(statisticsResponse.status).toBe(200)
        expect(statisticsResponse.headers.get('cache-control')).toBe('no-store')
        const statistics = systemHealthJobStatisticsSchema.parse(await statisticsResponse.json())
        expect(statistics.dailyRuns).toHaveLength(7)
        expect(statistics.recentAnomalies).toEqual([])
        expect(operationLogReceiver).not.toHaveBeenCalled()
        expect(await readdir(root)).toEqual([])
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    },
  )

  dbTest('turns contract invariant failures into an unknown safe 500 response', async ({ db }) => {
    const scheduledJobService = createTestScheduledJobService(db)
    const malformed = { ...scheduledJobService.diagnostics(), rawError: 'private diagnostic' }
    vi.spyOn(scheduledJobService, 'diagnostics').mockReturnValueOnce(malformed)
    vi.spyOn(LocalAttachmentStorage.prototype, 'checkHealth').mockResolvedValueOnce(undefined)
    const app = createApp(db, { scheduledJobService })
    const allowed = await createSystemAccessFixture(db, { accessCodes: ['ops:system-health:list'] })
    const response = await app.request('/api/ops/system-health', { headers: allowed.authHeaders })
    expect(response.status).toBe(500)
    expect(await response.text()).toBe('Internal Server Error')
  })
})
