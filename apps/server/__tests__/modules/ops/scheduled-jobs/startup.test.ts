import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocalAttachmentStorage } from '../../../../src/modules/attachments/storage'
import { readScheduledJobRetentionConfig } from '../../../../src/modules/ops/scheduled-jobs/config'
import { createScheduledJobDefinitions } from '../../../../src/modules/ops/scheduled-jobs/definitions'
import { createScheduledJobRepository } from '../../../../src/modules/ops/scheduled-jobs/repository'
import { startScheduledJobs } from '../../../../src/modules/ops/scheduled-jobs/startup'
import { createLogger } from '../../../../src/runtime/logger'
import { createScheduledJobRepositoryMock } from './helpers'

vi.mock('../../../../src/modules/ops/scheduled-jobs/repository', () => ({
  createScheduledJobRepository: vi.fn(),
}))

afterEach(() => vi.resetAllMocks())

describe('scheduled job startup diagnostics', () => {
  it('exposes current diagnostics and an immutable task catalog containing only keys and names', async () => {
    const repository = createScheduledJobRepositoryMock({
      initialize: vi.fn(async () => ({ interruptedRuns: [], recoverableRuns: [] })),
      listDueScheduled: vi.fn(async () => []),
      findNextScheduledAt: vi.fn(async () => null),
    })
    vi.mocked(createScheduledJobRepository).mockReturnValue(repository)
    const options = {
      database: {} as never,
      logger: createLogger({ level: 'silent' }),
      storage: new LocalAttachmentStorage('/unused'),
      retention: readScheduledJobRetentionConfig({}),
    }
    const runtime = await startScheduledJobs(options)
    try {
      expect(runtime.diagnostics().runtimeStatus).toBe('running')
      const expected = createScheduledJobDefinitions(options).map(({ key, name }) => ({
        key,
        name,
      }))
      expect(runtime.taskCatalog).toEqual(expected)
      expect(Object.isFrozen(runtime.taskCatalog)).toBe(true)
      for (const task of runtime.taskCatalog) {
        expect(Object.isFrozen(task)).toBe(true)
        expect(Object.keys(task)).toEqual(['key', 'name'])
      }
    } finally {
      await runtime.stop()
    }
    expect(runtime.diagnostics().runtimeStatus).toBe('stopped')
  })
})
