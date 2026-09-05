import { vi } from 'vitest'
import type { Logger } from 'pino'
import type { Db } from '../../../../src/db'
import type { ScheduledJobDiagnostics } from '../../../../src/modules/ops/scheduled-jobs/scheduler'
import type { ScheduledJobService } from '../../../../src/modules/ops/scheduled-jobs/service'
import * as systemHealthRepository from '../../../../src/modules/ops/system-health/repository'
import { createSystemHealthService } from '../../../../src/modules/ops/system-health/service'
import * as systemHealthStorage from '../../../../src/modules/ops/system-health/storage'
import { createScheduledJobSchedulerStub } from '../../../helpers/app'

export const observedAt = new Date('2026-09-02T00:00:00.000Z')

export function createHealthTestContext(database: Db) {
  const databaseResult = {
    latencyMs: 3,
    checkedAt: observedAt,
    runningCount: 2,
    overdueCount: 0,
    oldestOverdueAt: null as Date | null,
  }
  const repository = {
    readSnapshot: vi.fn<
      ReturnType<typeof systemHealthRepository.createSystemHealthRepository>['readSnapshot']
    >(async () => databaseResult),
    readJobStatistics: vi.fn<
      ReturnType<typeof systemHealthRepository.createSystemHealthRepository>['readJobStatistics']
    >(async () => ({
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
  const checkStorageHealth = vi.fn<ReturnType<typeof systemHealthStorage.createStorageHealthCheck>>(
    async () => ({
      status: 'healthy',
      provider: 'local',
      latencyMs: 1,
      checkedAt: observedAt.toISOString(),
      cached: false,
    }),
  )
  const logger = { error: vi.fn<Logger['error']>() }
  const scheduledJobs = {
    diagnostics,
    getTaskName: vi.fn<ScheduledJobService['getTaskName']>((taskKey) => `名称 ${taskKey}`),
  }
  vi.spyOn(systemHealthRepository, 'createSystemHealthRepository').mockReturnValueOnce(repository)
  vi.spyOn(systemHealthStorage, 'createStorageHealthCheck').mockReturnValueOnce(checkStorageHealth)
  return {
    repository,
    checkStorageHealth,
    logger,
    databaseResult,
    scheduler,
    diagnostics,
    service: createSystemHealthService(database, scheduledJobs),
  }
}
