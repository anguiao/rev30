import type { SystemHealthSnapshot } from '@rev30/contracts'
import { vi } from 'vitest'
import type { Logger } from 'pino'
import { scheduledJobTaskKeys } from '../../../../src/modules/ops/scheduled-jobs/registry'
import type { ScheduledJobDiagnostics } from '../../../../src/modules/ops/scheduled-jobs/scheduler'
import type { SystemHealthRepository } from '../../../../src/modules/ops/system-health/repository'
import { createSystemHealthService } from '../../../../src/modules/ops/system-health/service'
import { createScheduledJobSchedulerStub } from '../../../helpers/app'

export const observedAt = new Date('2026-09-02T00:00:00.000Z')

export function createHealthTestContext() {
  const databaseResult = {
    latencyMs: 3,
    checkedAt: observedAt,
    runningCount: 2,
    overdueCount: 0,
    oldestOverdueAt: null as Date | null,
  }
  const repository = {
    readSnapshot: vi.fn<SystemHealthRepository['readSnapshot']>(async () => databaseResult),
    readJobStatistics: vi.fn<SystemHealthRepository['readJobStatistics']>(async () => ({
      dailyRuns: [],
      statusDistribution: [],
      failureCategories: [],
      averageDurations: [],
      recentAnomalies: [],
    })),
  }
  const scheduler: ScheduledJobDiagnostics = {
    ...createScheduledJobSchedulerStub().diagnostics(),
    runtimeStatus: 'running',
  }
  const diagnostics = vi.fn(() => ({ ...scheduler }))
  const storageProbe = vi.fn<() => Promise<SystemHealthSnapshot['storage']>>(async () => ({
    status: 'healthy',
    provider: 'local',
    latencyMs: 1,
    checkedAt: observedAt.toISOString(),
    cached: false,
  }))
  const logger = { error: vi.fn<Logger['error']>() }
  const now = vi.fn(() => observedAt)
  const taskCatalog = scheduledJobTaskKeys.map((key) => ({ key, name: `名称 ${key}` }))
  const options = { repository, diagnostics, storageProbe, logger, now, taskCatalog }
  return { ...options, databaseResult, scheduler, service: createSystemHealthService(options) }
}
