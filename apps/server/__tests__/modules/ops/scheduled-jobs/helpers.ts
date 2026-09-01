import { vi } from 'vitest'
import type { ScheduledJobRepository } from '../../../../src/modules/ops/scheduled-jobs/repository'

export function createScheduledJobRepositoryMock<T extends Partial<ScheduledJobRepository>>(
  overrides: T,
) {
  const repository: ScheduledJobRepository = {
    listDueScheduled: vi.fn<ScheduledJobRepository['listDueScheduled']>(),
    findNextScheduledAt: vi.fn<ScheduledJobRepository['findNextScheduledAt']>(),
    findNextActiveScheduledAt: vi.fn<ScheduledJobRepository['findNextActiveScheduledAt']>(),
    list: vi.fn<ScheduledJobRepository['list']>(),
    findPlan: vi.fn<ScheduledJobRepository['findPlan']>(),
    listRuns: vi.fn<ScheduledJobRepository['listRuns']>(),
    findRun: vi.fn<ScheduledJobRepository['findRun']>(),
    updatePlan: vi.fn<ScheduledJobRepository['updatePlan']>(),
    updateEnabled: vi.fn<ScheduledJobRepository['updateEnabled']>(),
    initialize: vi.fn<ScheduledJobRepository['initialize']>(),
    claimScheduled: vi.fn<ScheduledJobRepository['claimScheduled']>(),
    claimManual: vi.fn<ScheduledJobRepository['claimManual']>(),
    claimRecovery: vi.fn<ScheduledJobRepository['claimRecovery']>(),
    requestCancellation: vi.fn<ScheduledJobRepository['requestCancellation']>(),
    finalizeRun: vi.fn<ScheduledJobRepository['finalizeRun']>(),
  }

  return Object.assign(repository, overrides)
}
