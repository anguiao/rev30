import { afterEach, describe, expect, vi } from 'vitest'
import { LocalAttachmentStorage } from '../../../../src/modules/attachments/storage'
import { readScheduledJobRetentionConfig } from '../../../../src/modules/ops/scheduled-jobs/config'
import { createScheduledJobDefinitions } from '../../../../src/modules/ops/scheduled-jobs/definitions'
import { ScheduledJobNotFoundError } from '../../../../src/modules/ops/scheduled-jobs/errors'
import { createScheduledJobRepository } from '../../../../src/modules/ops/scheduled-jobs/repository'
import { startScheduledJobs } from '../../../../src/modules/ops/scheduled-jobs/startup'
import { createLogger } from '../../../../src/runtime/logger'
import { dbTest } from '../../../fixtures/database'
import { createScheduledJobRepositoryMock } from './helpers'

vi.mock('../../../../src/modules/ops/scheduled-jobs/repository', () => ({
  createScheduledJobRepository: vi.fn(),
}))

afterEach(() => vi.resetAllMocks())

describe('scheduled job startup diagnostics', () => {
  dbTest('reads diagnostics and task names through the service', async ({ db }) => {
    const repository = createScheduledJobRepositoryMock({
      initialize: vi.fn(async () => ({ interruptedRuns: [], recoverableRuns: [] })),
      listDueScheduled: vi.fn(async () => []),
      findNextScheduledAt: vi.fn(async () => null),
    })
    vi.mocked(createScheduledJobRepository).mockReturnValue(repository)
    const options = {
      database: db,
      logger: createLogger({ level: 'silent' }),
      storage: new LocalAttachmentStorage('/unused'),
      retention: readScheduledJobRetentionConfig({}),
    }
    const runtime = await startScheduledJobs(options)
    try {
      expect(runtime.service.diagnostics().runtimeStatus).toBe('running')
      for (const task of createScheduledJobDefinitions(options)) {
        expect(runtime.service.getTaskName(task.key)).toBe(task.name)
      }
      expect(() => runtime.service.getTaskName('unknown-task')).toThrow(ScheduledJobNotFoundError)
    } finally {
      await runtime.stop()
    }
    expect(runtime.service.diagnostics().runtimeStatus).toBe('stopped')
  })
})
