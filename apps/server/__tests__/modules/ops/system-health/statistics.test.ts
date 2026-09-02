import { randomUUID } from 'node:crypto'
import type { ScheduledJobRunStatus } from '@rev30/contracts'
import { eq, sql } from 'drizzle-orm'
import { describe, expect } from 'vitest'
import { opsJobRuns, opsScheduledJobs } from '../../../../src/db/schema'
import { scheduledJobTaskKeys } from '../../../../src/modules/ops/scheduled-jobs/registry'
import { createSystemHealthRepository } from '../../../../src/modules/ops/system-health/repository'
import { createSystemHealthService } from '../../../../src/modules/ops/system-health/service'
import { dbTest, type TestDatabase } from '../../../fixtures/database'
import { createHealthTestContext } from './helpers'

const generatedAt = new Date('2026-09-02T16:30:00.000Z')
const taskKey = scheduledJobTaskKeys[0]
const zeroCounts = { running: 0, success: 0, failure: 0, skipped: 0, cancelled: 0, interrupted: 0 }
const catalog = scheduledJobTaskKeys.map((key) => ({ key, name: `名称 ${key}` }))

function run(
  status: ScheduledJobRunStatus,
  overrides: Partial<typeof opsJobRuns.$inferInsert> = {},
): typeof opsJobRuns.$inferInsert {
  const createdAt = new Date('2026-09-02T15:00:00.000Z')
  const base = {
    id: randomUUID(),
    taskKey,
    triggerSource: 'recovery',
    status,
    createdAt,
    startedAt: createdAt,
    finishedAt: new Date(createdAt.getTime() + 100),
    durationMs: 100,
  }
  if (status === 'running') return { ...base, finishedAt: null, durationMs: null, ...overrides }
  if (status === 'success') return { ...base, deletedCount: 0, failedCount: 0, ...overrides }
  if (status === 'failure')
    return { ...base, errorCategory: 'internal', errorSummary: '任务执行失败', ...overrides }
  if (status === 'skipped') return { ...base, startedAt: null, durationMs: null, ...overrides }
  if (status === 'interrupted') return { ...base, durationMs: null, ...overrides }
  return {
    ...base,
    cancelRequestedAt: createdAt,
    cancelRequestedByUserId: randomUUID(),
    cancelRequestedByUsername: 'operator',
    cancelRequestedByNickname: 'Operator',
    ...overrides,
  }
}

function createService(db: TestDatabase) {
  const context = createHealthTestContext()
  return createSystemHealthService({
    ...context,
    repository: createSystemHealthRepository(db),
    taskCatalog: catalog,
    now: () => generatedAt,
  })
}

describe('system health retained job statistics', () => {
  dbTest('fills all fixed buckets when no retained runs exist', async ({ db }) => {
    const result = await createService(db).jobStatistics()
    expect(result).toEqual({
      generatedAt: generatedAt.toISOString(),
      timezone: 'Asia/Shanghai',
      dailyRuns: [
        '2026-08-28',
        '2026-08-29',
        '2026-08-30',
        '2026-08-31',
        '2026-09-01',
        '2026-09-02',
        '2026-09-03',
      ].map((date) => ({ date, ...zeroCounts })),
      statusDistribution: zeroCounts,
      failureCategories: ['partial_failure', 'database', 'storage', 'internal'].map((category) => ({
        category,
        count: 0,
      })),
      averageDurations: [],
      recentAnomalies: [],
    })
  })

  dbTest(
    'uses Shanghai created-at windows with exact inclusive starts and exclusive observation end',
    async ({ db }) => {
      await db.execute(sql`SET LOCAL TIME ZONE 'America/New_York'`)
      const times = [
        '2026-08-04T15:59:59.999Z', // Before the 30-day start.
        '2026-08-04T16:00:00.000Z', // August 5 in Shanghai.
        '2026-08-27T15:59:59.999Z', // Before the seven-day start.
        '2026-08-27T16:00:00.000Z', // August 28 in Shanghai.
        '2026-09-02T15:59:59.999Z',
        '2026-09-02T16:00:00.000Z',
        '2026-09-02T16:29:59.999Z',
        '2026-09-02T16:30:00.000Z',
      ]
      await db.insert(opsJobRuns).values(
        times.map((time) =>
          run('success', {
            createdAt: new Date(time),
            finishedAt: new Date('2026-09-03T00:00:00.000Z'),
          }),
        ),
      )
      const result = await createService(db).jobStatistics()
      expect(result.statusDistribution).toEqual({ ...zeroCounts, success: 6 })
      expect(result.dailyRuns.map(({ success }) => success)).toEqual([1, 0, 0, 0, 0, 1, 2])
      expect(result.averageDurations[0]).toMatchObject({ runCount: 6 })
    },
  )

  dbTest(
    'counts every status, fixed failure categories and only currently retained records',
    async ({ db }) => {
      const rows = (
        ['running', 'success', 'failure', 'skipped', 'cancelled', 'interrupted'] as const
      ).map((status) => run(status))
      rows.push(
        ...(['partial_failure', 'database', 'storage'] as const).map((errorCategory) =>
          run('failure', { errorCategory }),
        ),
      )
      await db.insert(opsJobRuns).values(rows)
      const service = createService(db)
      const result = await service.jobStatistics()
      expect(result.statusDistribution).toEqual({
        running: 1,
        success: 1,
        failure: 4,
        skipped: 1,
        cancelled: 1,
        interrupted: 1,
      })
      expect(result.failureCategories.map(({ count }) => count)).toEqual([1, 1, 1, 1])
      expect(result.dailyRuns.find(({ date }) => date === '2026-09-02')).toMatchObject(
        result.statusDistribution,
      )
      await db.delete(opsJobRuns).where(eq(opsJobRuns.id, rows[2]!.id!))
      const retained = await service.jobStatistics()
      expect(retained.statusDistribution.failure).toBe(3)
      expect(retained.failureCategories.at(-1)).toEqual({ category: 'internal', count: 0 })
    },
  )

  dbTest(
    'rounds all success averages before sorting and selecting the top five with sample counts',
    async ({ db }) => {
      const keys = [...scheduledJobTaskKeys].sort()
      const rows = keys
        .slice(0, 4)
        .map((key, index) => run('success', { taskKey: key, durationMs: 1000 - index * 100 }))
      rows.push(
        ...[101, 100, 100, 100].map((durationMs) =>
          run('success', { taskKey: keys[4]!, durationMs }),
        ),
      )
      rows.push(
        ...[101, 100, 100].map((durationMs) => run('success', { taskKey: keys[5]!, durationMs })),
      )
      rows.push(run('failure', { taskKey: keys[4]!, durationMs: 900_000 }))
      await db.insert(opsJobRuns).values(rows)
      const result = await createService(db).jobStatistics()
      expect(result.averageDurations.map(({ taskKey }) => taskKey)).toEqual(keys.slice(0, 5))
      expect(result.averageDurations[4]).toEqual({
        taskKey: keys[4],
        taskName: `名称 ${keys[4]}`,
        averageDurationMs: 100,
        runCount: 4,
      })
    },
  )

  dbTest(
    'lists only the latest retained anomalies beyond 30 days in stable finish and ID order',
    async ({ db }) => {
      const old = new Date('2026-01-01T00:00:00.000Z')
      const ids = Array.from(
        { length: 6 },
        (_, index) => `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      )
      await db.insert(opsJobRuns).values([
        ...ids.map((id, index) =>
          run(index % 2 === 0 ? 'failure' : 'interrupted', {
            id,
            createdAt: old,
            startedAt: old,
            finishedAt: old,
          }),
        ),
        run('cancelled'),
        run('skipped'),
      ])
      const result = await createService(db).jobStatistics()
      expect(result.recentAnomalies.map(({ runId }) => runId)).toEqual(ids.toReversed().slice(0, 5))
      expect(result.statusDistribution.failure).toBe(0)
      expect(result.recentAnomalies[0]).toMatchObject({
        status: 'interrupted',
        errorCategory: null,
        errorSummary: null,
      })
      expect(result.recentAnomalies[1]).toMatchObject({
        status: 'failure',
        errorCategory: 'internal',
        errorSummary: '任务执行失败',
        taskName: `名称 ${taskKey}`,
      })
      await db
        .update(opsJobRuns)
        .set({ finishedAt: new Date(old.getTime() + 1) })
        .where(eq(opsJobRuns.id, ids[0]!))
      expect((await createService(db).jobStatistics()).recentAnomalies[0]!.runId).toBe(ids[0])
    },
  )

  dbTest(
    'rejects unknown catalog keys and leaves current health unaffected by historical failures',
    async ({ db }) => {
      await db.update(opsScheduledJobs).set({ enabled: false, nextRunAt: null })
      await db.insert(opsJobRuns).values(run('failure'))
      expect(await createService(db).snapshot()).toMatchObject({ status: 'healthy', issues: [] })
      await db.insert(opsScheduledJobs).values({
        taskKey: 'unknown-task',
        cronExpression: '0 0 * * *',
        timezone: 'Asia/Shanghai',
        enabled: false,
        nextRunAt: null,
      })
      await db
        .insert(opsJobRuns)
        .values(run('failure', { taskKey: 'unknown-task', finishedAt: generatedAt }))
      await expect(createService(db).jobStatistics()).rejects.toThrow(
        'Unknown scheduled job task: unknown-task',
      )
    },
  )
})
