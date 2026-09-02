import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, vi } from 'vitest'
import { opsJobRuns, opsScheduledJobs } from '../../../../src/db/schema'
import { scheduledJobTaskKeys } from '../../../../src/modules/ops/scheduled-jobs/registry'
import { createSystemHealthRepository } from '../../../../src/modules/ops/system-health/repository'
import { dbTest } from '../../../fixtures/database'

const observedAt = new Date('2026-09-02T00:00:00.000Z')
afterEach(() => vi.restoreAllMocks())

describe('system health snapshot repository', () => {
  dbTest(
    'counts all running jobs and only plans strictly more than 60 seconds overdue',
    async ({ db }) => {
      await db.update(opsScheduledJobs).set({ enabled: false, nextRunAt: null })
      const offsets = [-60_001, -90_000, -60_000, -59_999, 1]
      for (const [index, offset] of offsets.entries()) {
        await db
          .update(opsScheduledJobs)
          .set({ enabled: true, nextRunAt: new Date(observedAt.getTime() + offset) })
          .where(eq(opsScheduledJobs.taskKey, scheduledJobTaskKeys[index]!))
      }
      await db.insert(opsJobRuns).values([
        {
          taskKey: scheduledJobTaskKeys[0],
          triggerSource: 'recovery',
          status: 'running',
          startedAt: observedAt,
        },
        {
          taskKey: scheduledJobTaskKeys[7],
          triggerSource: 'recovery',
          status: 'running',
          startedAt: observedAt,
        },
        {
          taskKey: scheduledJobTaskKeys[1],
          triggerSource: 'recovery',
          status: 'failure',
          startedAt: observedAt,
          finishedAt: observedAt,
          durationMs: 0,
          errorCategory: 'internal',
          errorSummary: '任务执行失败',
        },
      ])
      const monotonicNow = vi.fn().mockReturnValueOnce(10).mockReturnValueOnce(13.6)
      const result = await createSystemHealthRepository(db, {
        now: () => observedAt,
        monotonicNow,
      }).readSnapshot(observedAt)
      expect(result).toEqual({
        latencyMs: 4,
        checkedAt: observedAt,
        runningCount: 2,
        overdueCount: 2,
        oldestOverdueAt: new Date(observedAt.getTime() - 90_000),
      })
      expect(monotonicNow).toHaveBeenCalledTimes(2)
    },
  )

  dbTest(
    'returns zero counts and no oldest overdue plan when there is no backlog',
    async ({ db }) => {
      await db.update(opsScheduledJobs).set({ enabled: false, nextRunAt: null })
      expect(await createSystemHealthRepository(db).readSnapshot(observedAt)).toMatchObject({
        runningCount: 0,
        overdueCount: 0,
        oldestOverdueAt: null,
      })
    },
  )

  dbTest(
    'rejects the complete result when either the light probe or a shared query fails',
    async ({ db }) => {
      const repository = createSystemHealthRepository(db)
      const error = new Error('private query error')
      vi.spyOn(db, 'execute').mockRejectedValueOnce(error)
      await expect(repository.readSnapshot(observedAt)).rejects.toBe(error)
      vi.spyOn(db, 'select').mockImplementationOnce(() => {
        throw error
      })
      await expect(repository.readSnapshot(observedAt)).rejects.toBe(error)
    },
  )
})
