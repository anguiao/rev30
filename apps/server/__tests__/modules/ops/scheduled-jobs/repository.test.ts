import { randomUUID } from 'node:crypto'
import type { ScheduledJobTaskKey } from '@rev30/contracts'
import { asc, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { Db } from '../../../../src/db'
import { opsJobRuns, opsScheduledJobs } from '../../../../src/db/schema'
import {
  ScheduledJobNotFoundError,
  ScheduledJobStateConflictError,
} from '../../../../src/modules/ops/scheduled-jobs/errors'
import {
  createScheduledJobRepository,
  type RecoverableScheduledJobRun,
} from '../../../../src/modules/ops/scheduled-jobs/repository'
import { scheduledJobTaskKeys } from '../../../../src/modules/ops/scheduled-jobs/registry'
import { dbTest, type TestDatabase } from '../../../fixtures/database'

const taskKeys = scheduledJobTaskKeys
const firstTask = taskKeys[0]!
const secondTask = taskKeys[1]!
const thirdTask = taskKeys[2]!
const dueAt = new Date('2026-08-25T00:00:00.000Z')
const claimAt = new Date('2026-08-25T12:05:00.000Z')
const futureAt = new Date('2026-08-26T00:00:00.000Z')
const actor = {
  id: '40000000-0000-4000-8000-000000000001',
  username: 'operator',
  nickname: 'Operator',
}
const secondActor = {
  id: '40000000-0000-4000-8000-000000000002',
  username: 'second',
  nickname: 'Second',
}

async function setPlan(
  db: TestDatabase,
  taskKey: ScheduledJobTaskKey,
  values: Partial<typeof opsScheduledJobs.$inferInsert>,
) {
  await db.update(opsScheduledJobs).set(values).where(eq(opsScheduledJobs.taskKey, taskKey))
}

async function runRows(db: TestDatabase, taskKey = firstTask) {
  return await db
    .select()
    .from(opsJobRuns)
    .where(eq(opsJobRuns.taskKey, taskKey))
    .orderBy(asc(opsJobRuns.createdAt), asc(opsJobRuns.id))
}

function runningRun(
  taskKey: ScheduledJobTaskKey,
  overrides: Partial<typeof opsJobRuns.$inferInsert> = {},
): typeof opsJobRuns.$inferInsert {
  return {
    id: randomUUID(),
    taskKey,
    triggerSource: 'scheduled',
    status: 'running',
    scheduledFor: dueAt,
    startedAt: dueAt,
    createdAt: dueAt,
    ...overrides,
  }
}

async function occupy(db: TestDatabase, run: typeof opsJobRuns.$inferInsert) {
  await db.insert(opsJobRuns).values(run)
  await setPlan(db, run.taskKey as ScheduledJobTaskKey, { activeRunId: run.id })
  return run
}

function createClaimLockTrackingDb(events: string[]) {
  const plan: typeof opsScheduledJobs.$inferSelect = {
    taskKey: firstTask,
    cronExpression: '0 * * * *',
    timezone: 'UTC',
    enabled: true,
    nextRunAt: dueAt,
    activeRunId: randomUUID(),
    createdAt: dueAt,
    updatedAt: dueAt,
  }
  const tx = {
    select() {
      return {
        from() {
          events.push('select:plan')
          return {
            where() {
              return {
                limit() {
                  return {
                    for(mode: string) {
                      events.push(`lock:${mode}`)
                      return Promise.resolve([plan])
                    },
                  }
                },
              }
            },
          }
        },
      }
    },
    insert() {
      return {
        values() {
          events.push('insert:run')
          return {
            returning() {
              events.push('returning:run')
              return Promise.resolve([{ id: '00000000-0000-7000-8000-000000000001' }])
            },
          }
        },
      }
    },
    update() {
      return {
        set() {
          return {
            where() {
              events.push('update:plan')
              return Promise.resolve()
            },
          }
        },
      }
    },
  }

  return {
    transaction<T>(operation: (transaction: typeof tx) => Promise<T>) {
      events.push('transaction')
      return operation(tx)
    },
  } as unknown as Db
}

describe('scheduled job repository claims', () => {
  dbTest(
    'returns ordered due plans and the next enabled wake time without claiming',
    async ({ db }) => {
      await db.update(opsScheduledJobs).set({ enabled: false, nextRunAt: null })
      await setPlan(db, firstTask, { enabled: true, nextRunAt: claimAt })
      await setPlan(db, secondTask, { enabled: true, nextRunAt: dueAt })
      await setPlan(db, thirdTask, { enabled: false, nextRunAt: null })
      const repository = createScheduledJobRepository(db)

      await expect(repository.listDueScheduled({ now: claimAt })).resolves.toEqual([
        { taskKey: secondTask, nextRunAt: dueAt, activeRunId: null },
        { taskKey: firstTask, nextRunAt: claimAt, activeRunId: null },
      ])
      await expect(repository.findNextScheduledAt()).resolves.toEqual(dueAt)
      await expect(repository.findNextActiveScheduledAt()).resolves.toBeNull()
      const active = await occupy(db, runningRun(firstTask))
      await setPlan(db, firstTask, { nextRunAt: futureAt, activeRunId: active.id })
      await expect(repository.findNextActiveScheduledAt()).resolves.toEqual(futureAt)
      expect(await runRows(db)).toHaveLength(1)
    },
  )

  it('locks the plan with FOR UPDATE inside both scheduled and manual claim transactions', async () => {
    const scheduledEvents: string[] = []
    const scheduledRepository = createScheduledJobRepository(
      createClaimLockTrackingDb(scheduledEvents),
    )
    await scheduledRepository.claimScheduled({
      taskKey: firstTask,
      now: claimAt,
    })
    expect(scheduledEvents).toEqual([
      'transaction',
      'select:plan',
      'lock:update',
      'insert:run',
      'returning:run',
      'update:plan',
    ])

    const manualEvents: string[] = []
    const manualRepository = createScheduledJobRepository(createClaimLockTrackingDb(manualEvents))
    await manualRepository.claimManual({
      taskKey: firstTask,
      now: claimAt,
      actor,
    })
    expect(manualEvents).toEqual([
      'transaction',
      'select:plan',
      'lock:update',
      'insert:run',
      'returning:run',
    ])
  })

  dbTest(
    'allows exactly one running claim and records scheduled/manual overlap',
    async ({ db }) => {
      await setPlan(db, firstTask, { enabled: true, nextRunAt: dueAt })
      const repository = createScheduledJobRepository(db)

      const scheduled = await repository.claimScheduled({
        taskKey: firstTask,
        now: claimAt,
      })
      const manual = await repository.claimManual({
        taskKey: firstTask,
        now: claimAt,
        actor,
      })

      expect(scheduled).toMatchObject({ blockedByRunId: null })
      if (!scheduled) throw new Error('Expected a scheduled claim')
      expect(manual).toMatchObject({ blockedByRunId: scheduled.runId })
      expect(scheduled.runId[14]).toBe('7')
      expect(manual.runId[14]).toBe('7')
      const rows = await runRows(db)
      expect(rows).toHaveLength(2)
      expect(rows.every(({ id }) => id[14] === '7')).toBe(true)
      expect(rows.find(({ triggerSource }) => triggerSource === 'scheduled')).toMatchObject({
        status: 'running',
      })
      expect(rows.find(({ triggerSource }) => triggerSource === 'manual')).toMatchObject({
        status: 'skipped',
        triggeredByUserId: actor.id,
        triggeredByUsername: actor.username,
        triggeredByNickname: actor.nickname,
      })
    },
  )

  dbTest(
    'merges missed scheduled occurrences and treats disabled or stale plans as no-op',
    async ({ db }) => {
      await setPlan(db, firstTask, {
        cronExpression: '0 * * * *',
        timezone: 'UTC',
        enabled: true,
        nextRunAt: dueAt,
      })
      const repository = createScheduledJobRepository(db)

      await expect(
        repository.claimScheduled({
          taskKey: firstTask,
          now: claimAt,
        }),
      ).resolves.toMatchObject({ blockedByRunId: null, scheduledFor: dueAt })
      const [plan] = await db
        .select()
        .from(opsScheduledJobs)
        .where(eq(opsScheduledJobs.taskKey, firstTask))
      expect(plan?.nextRunAt).toEqual(new Date('2026-08-25T13:00:00.000Z'))

      await expect(
        repository.claimScheduled({
          taskKey: firstTask,
          now: claimAt,
        }),
      ).resolves.toBeNull()
      await setPlan(db, secondTask, { enabled: false, nextRunAt: null })
      await expect(
        repository.claimScheduled({
          taskKey: secondTask,
          now: claimAt,
        }),
      ).resolves.toBeNull()
    },
  )

  dbTest(
    'writes scheduled overlap and advances the plan without replacing the active run',
    async ({ db }) => {
      const active = await occupy(db, runningRun(firstTask))
      await setPlan(db, firstTask, {
        cronExpression: '0 * * * *',
        timezone: 'UTC',
        enabled: true,
        nextRunAt: dueAt,
      })
      const repository = createScheduledJobRepository(db)

      const overlap = await repository.claimScheduled({
        taskKey: firstTask,
        now: claimAt,
      })
      expect(overlap).toMatchObject({
        blockedByRunId: active.id,
        scheduledFor: dueAt,
      })
      if (!overlap) throw new Error('Expected a scheduled overlap claim')
      expect(overlap.runId[14]).toBe('7')
      const [plan] = await db
        .select()
        .from(opsScheduledJobs)
        .where(eq(opsScheduledJobs.taskKey, firstTask))
      expect(plan).toMatchObject({
        activeRunId: active.id,
        nextRunAt: new Date('2026-08-25T13:00:00.000Z'),
      })
    },
  )

  dbTest(
    'allows a disabled manual claim, leaves its plan unchanged, and distinguishes unknown tasks',
    async ({ db }) => {
      await setPlan(db, firstTask, { enabled: false, nextRunAt: null })
      const repository = createScheduledJobRepository(db)

      const manual = await repository.claimManual({
        taskKey: firstTask,
        now: claimAt,
        actor,
      })
      expect(manual).toMatchObject({ blockedByRunId: null })
      expect(manual.runId[14]).toBe('7')
      const [plan] = await db
        .select()
        .from(opsScheduledJobs)
        .where(eq(opsScheduledJobs.taskKey, firstTask))
      expect(plan).toMatchObject({ enabled: false, nextRunAt: null })
      await expect(
        repository.claimManual({
          taskKey: 'missing-task',
          now: claimAt,
          actor,
        }),
      ).rejects.toBeInstanceOf(ScheduledJobNotFoundError)
    },
  )
})

describe('scheduled job API repository operations', () => {
  dbTest(
    'lists plans with current and terminal runs and updates plan semantics',
    async ({ db }) => {
      await setPlan(db, firstTask, {
        cronExpression: '0 * * * *',
        timezone: 'UTC',
        enabled: true,
        nextRunAt: dueAt,
      })
      const active = await occupy(
        db,
        runningRun(firstTask, {
          id: randomUUID(),
          createdAt: new Date('2026-08-24T00:00:00.000Z'),
        }),
      )
      await db.insert(opsJobRuns).values({
        id: randomUUID(),
        taskKey: firstTask,
        triggerSource: 'scheduled',
        status: 'success',
        scheduledFor: new Date('2026-08-23T00:00:00.000Z'),
        startedAt: new Date('2026-08-23T00:00:00.000Z'),
        finishedAt: new Date('2026-08-23T00:00:01.000Z'),
        durationMs: 1000,
        deletedCount: 1,
        failedCount: 0,
        createdAt: new Date('2026-08-23T00:00:00.000Z'),
      })
      await db.insert(opsJobRuns).values({
        id: 'ffffffff-ffff-4fff-bfff-ffffffffffff',
        taskKey: firstTask,
        triggerSource: 'scheduled',
        status: 'failure',
        scheduledFor: new Date('2026-08-24T00:00:00.000Z'),
        startedAt: new Date('2026-08-24T00:00:01.000Z'),
        finishedAt: new Date('2026-08-24T00:00:03.000Z'),
        durationMs: 2000,
        failedCount: 1,
        errorCategory: 'internal',
        errorSummary: 'Safe failure',
        createdAt: new Date('2026-08-24T00:00:01.000Z'),
      })
      const repository = createScheduledJobRepository(db)

      const listed = await repository.list()
      expect(listed.plans).toHaveLength(8)
      expect(listed.currentRuns).toHaveLength(1)
      expect(listed.currentRuns[0]).toMatchObject({ taskKey: firstTask, status: 'running' })
      expect(listed.lastRuns).toHaveLength(1)
      expect(listed.lastRuns[0]).toMatchObject({
        taskKey: firstTask,
        id: 'ffffffff-ffff-4fff-bfff-ffffffffffff',
        status: 'failure',
      })
      expect(active.id).toBeDefined()

      const updated = await repository.updatePlan({
        taskKey: firstTask,
        schedule: { expression: '15 * * * *', timezone: 'UTC' },
        now: claimAt,
      })
      expect(updated).toMatchObject({
        cronExpression: '15 * * * *',
        timezone: 'UTC',
        enabled: true,
        activeRunId: active.id,
        nextRunAt: new Date('2026-08-25T12:15:00.000Z'),
      })

      await setPlan(db, firstTask, { enabled: false, nextRunAt: null })
      const disabledPlan = await repository.updatePlan({
        taskKey: firstTask,
        schedule: { expression: '30 * * * *', timezone: 'UTC' },
        now: claimAt,
      })
      expect(disabledPlan).toMatchObject({
        enabled: false,
        nextRunAt: null,
        activeRunId: active.id,
      })

      const disabled = await repository.updateEnabled({
        taskKey: firstTask,
        enabled: false,
        now: claimAt,
      })
      expect(disabled).toMatchObject({
        enabled: false,
        nextRunAt: null,
        activeRunId: active.id,
      })

      const enabled = await repository.updateEnabled({
        taskKey: firstTask,
        enabled: true,
        now: claimAt,
      })
      expect(enabled.enabled).toBe(true)
      expect(enabled.activeRunId).toBe(active.id)
      expect(enabled.nextRunAt?.getTime()).toBeGreaterThan(claimAt.getTime())
    },
  )

  dbTest('paginates runs by createdAt and id and matches detail task and run', async ({ db }) => {
    const first = '10000000-0000-4000-8000-000000000001'
    const second = 'ffffffff-ffff-4fff-bfff-ffffffffffff'
    const sameTime = new Date('2026-08-25T00:00:00.000Z')
    for (const [id, taskKey] of [
      [first, firstTask],
      [second, firstTask],
    ] as const) {
      await db.insert(opsJobRuns).values({
        id,
        taskKey,
        triggerSource: 'scheduled',
        status: 'skipped',
        scheduledFor: sameTime,
        finishedAt: sameTime,
        createdAt: sameTime,
      })
    }
    const repository = createScheduledJobRepository(db)

    const page = await repository.listRuns({ taskKey: firstTask, page: 1, pageSize: 1 })
    expect(page).toMatchObject({ total: 2, page: 1, pageSize: 1 })
    expect(page.list[0]?.id).toBe(second)
    await expect(repository.findRun(firstTask, second)).resolves.toMatchObject({ id: second })
    await expect(repository.findRun(secondTask, second)).resolves.toBeUndefined()
  })
})

describe('scheduled job startup recovery', () => {
  dbTest(
    'rejects task-key/plan mismatches and invalid Cron before mutating old running rows',
    async ({ db }) => {
      const oldRun = await occupy(db, runningRun(firstTask))
      const repository = createScheduledJobRepository(db)
      const extraTaskKey = `extra-${randomUUID()}`
      await db.insert(opsScheduledJobs).values({
        taskKey: extraTaskKey,
        cronExpression: '0 * * * *',
        timezone: 'UTC',
        enabled: false,
        nextRunAt: null,
      })

      await expect(repository.initialize({ taskKeys, startupAt: claimAt })).rejects.toThrow(
        /任务集合.*计划集合/,
      )
      await db.delete(opsScheduledJobs).where(eq(opsScheduledJobs.taskKey, extraTaskKey))
      await setPlan(db, secondTask, { cronExpression: 'invalid cron' })
      await expect(repository.initialize({ taskKeys, startupAt: claimAt })).rejects.toThrow()
      const [stored] = await db.select().from(opsJobRuns).where(eq(opsJobRuns.id, oldRun.id!))
      expect(stored).toMatchObject({ status: 'running', finishedAt: null })
    },
  )

  dbTest(
    'rejects mismatched active and orphan running state without repairing it',
    async ({ db }) => {
      const mismatched = await occupy(db, runningRun(secondTask))
      await setPlan(db, secondTask, { activeRunId: null })
      await setPlan(db, firstTask, { activeRunId: mismatched.id })
      const repository = createScheduledJobRepository(db)

      await expect(repository.initialize({ taskKeys, startupAt: claimAt })).rejects.toThrow(
        /运行状态不一致/,
      )
      const [stored] = await db.select().from(opsJobRuns).where(eq(opsJobRuns.id, mismatched.id!))
      expect(stored?.status).toBe('running')

      await setPlan(db, firstTask, { activeRunId: null })
      await expect(repository.initialize({ taskKeys, startupAt: claimAt })).rejects.toThrow(
        /运行状态不一致/,
      )
      const [orphan] = await db.select().from(opsJobRuns).where(eq(opsJobRuns.id, mismatched.id!))
      expect(orphan?.status).toBe('running')
    },
  )

  dbTest(
    'interrupts at one instant and returns latest non-skipped uncancelled runs in order',
    async ({ db }) => {
      const laterRun = await occupy(
        db,
        runningRun(firstTask, {
          startedAt: new Date('2026-08-25T01:00:00.000Z'),
          createdAt: new Date('2026-08-25T01:00:00.000Z'),
        }),
      )
      await db.insert(opsJobRuns).values({
        id: randomUUID(),
        taskKey: firstTask,
        triggerSource: 'scheduled',
        status: 'skipped',
        scheduledFor: new Date('2026-08-25T02:00:00.000Z'),
        finishedAt: new Date('2026-08-25T02:00:00.000Z'),
        createdAt: new Date('2026-08-25T02:00:00.000Z'),
      })
      const cancelled = await occupy(
        db,
        runningRun(secondTask, {
          startedAt: dueAt,
          cancelRequestedAt: new Date('2026-08-25T00:30:00.000Z'),
          cancelRequestedByUserId: actor.id,
          cancelRequestedByUsername: actor.username,
          cancelRequestedByNickname: actor.nickname,
        }),
      )
      const earlierRun = await occupy(
        db,
        runningRun(thirdTask, {
          triggerSource: 'recovery',
          scheduledFor: null,
          startedAt: new Date('2026-08-24T23:00:00.000Z'),
          createdAt: new Date('2026-08-24T23:00:00.000Z'),
        }),
      )
      const repository = createScheduledJobRepository(db)

      const initialized = await repository.initialize({ taskKeys, startupAt: claimAt })

      expect(initialized.recoverableRuns).toEqual([
        {
          taskKey: thirdTask,
          scheduledFor: null,
          startedAt: new Date('2026-08-24T23:00:00.000Z'),
        },
        {
          taskKey: firstTask,
          scheduledFor: dueAt,
          startedAt: new Date('2026-08-25T01:00:00.000Z'),
        },
      ])
      expect(initialized.interruptedRuns).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            runId: laterRun.id,
            taskKey: firstTask,
            triggerSource: 'scheduled',
          }),
          expect.objectContaining({
            runId: cancelled.id,
            taskKey: secondTask,
            triggerSource: 'scheduled',
          }),
          expect.objectContaining({
            runId: earlierRun.id,
            taskKey: thirdTask,
            triggerSource: 'recovery',
          }),
        ]),
      )
      const stored = await db.select().from(opsJobRuns).where(eq(opsJobRuns.status, 'interrupted'))
      expect(stored).toHaveLength(3)
      expect(
        stored.every(
          (run) => run.finishedAt?.getTime() === claimAt.getTime() && run.durationMs === null,
        ),
      ).toBe(true)
      expect(stored.find(({ id }) => id === cancelled.id)?.cancelRequestedByUserId).toBe(actor.id)
      const plans = await db.select().from(opsScheduledJobs)
      expect(plans.every(({ activeRunId }) => activeRunId === null)).toBe(true)
    },
  )
})

describe('scheduled job recovery, cancellation, and finalization', () => {
  const recoverableRun = (
    overrides: Partial<RecoverableScheduledJobRun> = {},
  ): RecoverableScheduledJobRun => ({
    taskKey: firstTask,
    scheduledFor: null,
    startedAt: dueAt,
    ...overrides,
  })

  dbTest(
    'claims recovery with nullable scheduledFor, advances only a due enabled plan, and copies no actor',
    async ({ db }) => {
      await setPlan(db, firstTask, {
        cronExpression: '0 * * * *',
        timezone: 'UTC',
        enabled: true,
        nextRunAt: dueAt,
      })
      const repository = createScheduledJobRepository(db)
      const result = await repository.claimRecovery({
        run: recoverableRun(),
        now: claimAt,
      })

      expect(result).toMatchObject({ blockedByRunId: null, scheduledFor: null })
      expect(result.runId[14]).toBe('7')
      const [run] = await db.select().from(opsJobRuns).where(eq(opsJobRuns.id, result.runId!))
      expect(run).toMatchObject({
        triggerSource: 'recovery',
        scheduledFor: null,
        triggeredByUserId: null,
      })
      const [plan] = await db
        .select()
        .from(opsScheduledJobs)
        .where(eq(opsScheduledJobs.taskKey, firstTask))
      expect(plan?.nextRunAt).toEqual(new Date('2026-08-25T13:00:00.000Z'))
    },
  )

  dbTest(
    'preserves future/disabled recovery plans and records overlap against an active run',
    async ({ db }) => {
      await setPlan(db, firstTask, { enabled: true, nextRunAt: futureAt })
      const active = await occupy(db, runningRun(firstTask))
      const repository = createScheduledJobRepository(db)
      const overlap = await repository.claimRecovery({
        run: recoverableRun({ scheduledFor: dueAt }),
        now: claimAt,
      })
      expect(overlap).toMatchObject({
        blockedByRunId: active.id,
        scheduledFor: dueAt,
      })
      expect(overlap.runId[14]).toBe('7')
      let [plan] = await db
        .select()
        .from(opsScheduledJobs)
        .where(eq(opsScheduledJobs.taskKey, firstTask))
      expect(plan?.nextRunAt).toEqual(futureAt)

      await setPlan(db, secondTask, { enabled: false, nextRunAt: null })
      await expect(
        repository.claimRecovery({
          run: recoverableRun({ taskKey: secondTask }),
          now: claimAt,
        }),
      ).resolves.toMatchObject({ blockedByRunId: null })
      ;[plan] = await db
        .select()
        .from(opsScheduledJobs)
        .where(eq(opsScheduledJobs.taskKey, secondTask))
      expect(plan).toMatchObject({ enabled: false, nextRunAt: null })
    },
  )

  dbTest(
    'keeps the first cancellation snapshot and rejects terminal or non-current runs',
    async ({ db }) => {
      const active = await occupy(db, runningRun(firstTask))
      const repository = createScheduledJobRepository(db)
      const input = { taskKey: firstTask, runId: active.id!, now: claimAt, actor }

      await repository.requestCancellation(input)
      await repository.requestCancellation({ ...input, now: futureAt, actor: secondActor })
      const [stored] = await db.select().from(opsJobRuns).where(eq(opsJobRuns.id, active.id!))
      expect(stored).toMatchObject({
        cancelRequestedAt: claimAt,
        cancelRequestedByUserId: actor.id,
        cancelRequestedByUsername: actor.username,
      })
      await expect(
        repository.requestCancellation({ ...input, runId: randomUUID() }),
      ).rejects.toBeInstanceOf(ScheduledJobNotFoundError)

      await setPlan(db, firstTask, { activeRunId: null })
      await db
        .update(opsJobRuns)
        .set({ status: 'interrupted', finishedAt: claimAt })
        .where(eq(opsJobRuns.id, active.id!))
      await expect(repository.requestCancellation(input)).rejects.toBeInstanceOf(
        ScheduledJobStateConflictError,
      )
    },
  )

  dbTest(
    'lets an earlier cancel request win finalization and keeps retries idempotent after a new claim',
    async ({ db }) => {
      const active = await occupy(db, runningRun(firstTask))
      const repository = createScheduledJobRepository(db)
      await repository.requestCancellation({
        taskKey: firstTask,
        runId: active.id!,
        now: claimAt,
        actor,
      })
      const finish = new Date('2026-08-25T12:05:01.000Z')
      const finalizeInput = {
        taskKey: firstTask,
        runId: active.id!,
        completion: {
          status: 'failure' as const,
          finishedAt: finish,
          durationMs: 1000,
          deletedCount: 2,
          failedCount: 1,
          errorCategory: 'internal' as const,
          errorSummary: 'Safe failure',
        },
      }

      await expect(repository.finalizeRun(finalizeInput)).resolves.toMatchObject({
        status: 'cancelled',
      })
      const nextRun = await repository.claimManual({
        taskKey: firstTask,
        now: futureAt,
        actor: secondActor,
      })
      expect(nextRun).toMatchObject({ blockedByRunId: null })
      await expect(repository.finalizeRun(finalizeInput)).resolves.toMatchObject({
        status: 'cancelled',
      })
      const [stored] = await db.select().from(opsJobRuns).where(eq(opsJobRuns.id, active.id!))
      expect(stored).toMatchObject({
        status: 'cancelled',
        finishedAt: finish,
        durationMs: 1000,
        deletedCount: 2,
        failedCount: 1,
        errorCategory: null,
        errorSummary: null,
      })
      const [plan] = await db
        .select()
        .from(opsScheduledJobs)
        .where(eq(opsScheduledJobs.taskKey, firstTask))
      expect(plan?.activeRunId).toBe(nextRun.runId)
    },
  )

  dbTest('rejects cancellation after successful finalization wins the race', async ({ db }) => {
    const active = await occupy(db, runningRun(firstTask))
    const repository = createScheduledJobRepository(db)
    const finishedAt = new Date('2026-08-25T12:05:01.000Z')

    await repository.finalizeRun({
      taskKey: firstTask,
      runId: active.id!,
      completion: {
        status: 'success',
        finishedAt,
        durationMs: 1000,
        deletedCount: 4,
        failedCount: 0,
      },
    })

    await expect(
      repository.requestCancellation({
        taskKey: firstTask,
        runId: active.id!,
        now: futureAt,
        actor,
      }),
    ).rejects.toBeInstanceOf(ScheduledJobStateConflictError)
    const [stored] = await db.select().from(opsJobRuns).where(eq(opsJobRuns.id, active.id!))
    expect(stored).toMatchObject({
      status: 'success',
      cancelRequestedAt: null,
      cancelRequestedByUserId: null,
    })
  })

  dbTest(
    'persists a normal safe completion and rejects non-matching finalization',
    async ({ db }) => {
      const active = await occupy(db, runningRun(firstTask))
      const repository = createScheduledJobRepository(db)
      const finishedAt = new Date('2026-08-25T12:05:01.000Z')

      await expect(
        repository.finalizeRun({
          taskKey: firstTask,
          runId: active.id!,
          completion: {
            status: 'success',
            finishedAt,
            durationMs: 1000,
            deletedCount: 4,
            failedCount: 0,
          },
        }),
      ).resolves.toMatchObject({ status: 'success' })
      await expect(
        repository.finalizeRun({
          taskKey: firstTask,
          runId: randomUUID(),
          completion: {
            status: 'success',
            finishedAt,
            durationMs: 1000,
            deletedCount: 4,
            failedCount: 0,
          },
        }),
      ).rejects.toBeInstanceOf(ScheduledJobStateConflictError)
    },
  )
})
