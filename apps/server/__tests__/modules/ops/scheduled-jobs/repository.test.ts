import { randomUUID } from 'node:crypto'
import { scheduledJobTaskKeySchema, type ScheduledJobTaskKey } from '@rev30/contracts'
import { asc, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { Db } from '../../../../src/db'
import { opsJobRuns, opsScheduledJobs } from '../../../../src/db/schema'
import {
  createScheduledJobRepository,
  ScheduledJobNotFoundError,
  ScheduledJobStateConflictError,
  type ScheduledJobActorSnapshot,
  type ScheduledJobRecoveryCandidate,
} from '../../../../src/modules/ops/scheduled-jobs/repository'
import {
  createScheduledJobRegistry,
  type ScheduledJobDefinition,
} from '../../../../src/modules/ops/scheduled-jobs/registry'
import { dbTest, type TestDatabase } from '../../../fixtures/database'

const taskKeys = scheduledJobTaskKeySchema.options
const firstTask = taskKeys[0]!
const secondTask = taskKeys[1]!
const thirdTask = taskKeys[2]!
const executorId = '30000000-0000-4000-8000-000000000001'
const secondExecutorId = '30000000-0000-4000-8000-000000000002'
const dueAt = new Date('2026-08-25T00:00:00.000Z')
const claimAt = new Date('2026-08-25T12:05:00.000Z')
const futureAt = new Date('2026-08-26T00:00:00.000Z')
const actor: ScheduledJobActorSnapshot = {
  userId: '40000000-0000-4000-8000-000000000001',
  username: 'operator',
  nickname: 'Operator',
  sessionId: '50000000-0000-4000-8000-000000000001',
  requestId: '60000000-0000-4000-8000-000000000001',
}
const secondActor: ScheduledJobActorSnapshot = {
  userId: '40000000-0000-4000-8000-000000000002',
  username: 'second',
  nickname: 'Second',
  sessionId: '50000000-0000-4000-8000-000000000002',
  requestId: '60000000-0000-4000-8000-000000000002',
}

function registry(keys: readonly ScheduledJobTaskKey[] = taskKeys) {
  return createScheduledJobRegistry(
    keys.map((key): ScheduledJobDefinition => ({
      key,
      name: `Name for ${key}`,
      description: `Description for ${key}`,
      async run() {
        return { deletedCount: 0, failedCount: 0 }
      },
    })),
  )
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
    executorId,
    startedAt: dueAt,
    createdAt: dueAt,
    updatedAt: dueAt,
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
  it('locks the plan with FOR UPDATE inside both scheduled and manual claim transactions', async () => {
    const scheduledEvents: string[] = []
    const scheduledRepository = createScheduledJobRepository(
      createClaimLockTrackingDb(scheduledEvents),
    )
    await scheduledRepository.claimScheduled({
      taskKey: firstTask,
      now: claimAt,
      executorId,
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
      executorId,
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
        executorId,
      })
      const manual = await repository.claimManual({
        taskKey: firstTask,
        now: claimAt,
        executorId: secondExecutorId,
        actor,
      })

      expect(scheduled.kind).toBe('running')
      if (scheduled.kind !== 'running') throw new Error('Expected a running scheduled claim')
      expect(manual).toMatchObject({ kind: 'overlap', activeRunId: scheduled.runId })
      if (manual.kind !== 'overlap') throw new Error('Expected a manual overlap claim')
      expect(scheduled.runId[14]).toBe('7')
      expect(manual.runId[14]).toBe('7')
      const rows = await runRows(db)
      expect(rows).toHaveLength(2)
      expect(rows.every(({ id }) => id[14] === '7')).toBe(true)
      expect(rows.find(({ triggerSource }) => triggerSource === 'scheduled')).toMatchObject({
        status: 'running',
        skipReason: null,
      })
      expect(rows.find(({ triggerSource }) => triggerSource === 'manual')).toMatchObject({
        status: 'skipped',
        skipReason: 'overlap',
        triggeredByUserId: actor.userId,
        triggeredByUsername: actor.username,
        triggeredByNickname: actor.nickname,
        triggeredBySessionId: actor.sessionId,
        triggerRequestId: actor.requestId,
      })
    },
  )

  dbTest(
    'merges missed scheduled occurrences and treats disabled or stale candidates as no-op',
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
          executorId,
        }),
      ).resolves.toMatchObject({ kind: 'running', scheduledFor: dueAt })
      const [plan] = await db
        .select()
        .from(opsScheduledJobs)
        .where(eq(opsScheduledJobs.taskKey, firstTask))
      expect(plan?.nextRunAt).toEqual(new Date('2026-08-25T13:00:00.000Z'))

      await expect(
        repository.claimScheduled({
          taskKey: firstTask,
          now: claimAt,
          executorId,
        }),
      ).resolves.toEqual({ kind: 'stale' })
      await setPlan(db, secondTask, { enabled: false, nextRunAt: null })
      await expect(
        repository.claimScheduled({
          taskKey: secondTask,
          now: claimAt,
          executorId,
        }),
      ).resolves.toEqual({ kind: 'stale' })
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
        executorId,
      })
      expect(overlap).toMatchObject({
        kind: 'overlap',
        activeRunId: active.id,
        scheduledFor: dueAt,
      })
      if (overlap.kind !== 'overlap') throw new Error('Expected a scheduled overlap claim')
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
        executorId,
        actor,
      })
      expect(manual).toMatchObject({ kind: 'running' })
      if (manual.kind !== 'running') throw new Error('Expected a running manual claim')
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
          executorId,
          actor,
        }),
      ).resolves.toEqual({ kind: 'not-found' })
    },
  )
})

describe('scheduled job startup recovery', () => {
  dbTest(
    'rejects registry/plan mismatches and invalid Cron before mutating old running rows',
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

      await expect(
        repository.initialize({ registry: registry(), startupAt: claimAt }),
      ).rejects.toThrow(/Registry.*计划集合/)
      await db.delete(opsScheduledJobs).where(eq(opsScheduledJobs.taskKey, extraTaskKey))
      await setPlan(db, secondTask, { cronExpression: 'invalid cron' })
      await expect(
        repository.initialize({ registry: registry(), startupAt: claimAt }),
      ).rejects.toThrow()
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

      await expect(
        repository.initialize({ registry: registry(), startupAt: claimAt }),
      ).rejects.toThrow(/运行状态不一致/)
      const [stored] = await db.select().from(opsJobRuns).where(eq(opsJobRuns.id, mismatched.id!))
      expect(stored?.status).toBe('running')

      await setPlan(db, firstTask, { activeRunId: null })
      await expect(
        repository.initialize({ registry: registry(), startupAt: claimAt }),
      ).rejects.toThrow(/运行状态不一致/)
      const [orphan] = await db.select().from(opsJobRuns).where(eq(opsJobRuns.id, mismatched.id!))
      expect(orphan?.status).toBe('running')
    },
  )

  dbTest(
    'interrupts at one instant and returns latest non-skipped uncancelled candidates in order',
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
        skipReason: 'overlap',
        scheduledFor: new Date('2026-08-25T02:00:00.000Z'),
        finishedAt: new Date('2026-08-25T02:00:00.000Z'),
        createdAt: new Date('2026-08-25T02:00:00.000Z'),
        updatedAt: new Date('2026-08-25T02:00:00.000Z'),
      })
      const cancelled = await occupy(
        db,
        runningRun(secondTask, {
          startedAt: dueAt,
          cancelRequestedAt: new Date('2026-08-25T00:30:00.000Z'),
          cancelRequestedByUserId: actor.userId,
          cancelRequestedByUsername: actor.username,
          cancelRequestedByNickname: actor.nickname,
          cancelRequestedBySessionId: actor.sessionId,
          cancelRequestId: actor.requestId,
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

      const candidates = await repository.initialize({ registry: registry(), startupAt: claimAt })

      expect(candidates).toEqual([
        {
          originalRunId: earlierRun.id,
          taskKey: thirdTask,
          scheduledFor: null,
          startedAt: new Date('2026-08-24T23:00:00.000Z'),
        },
        {
          originalRunId: laterRun.id,
          taskKey: firstTask,
          scheduledFor: dueAt,
          startedAt: new Date('2026-08-25T01:00:00.000Z'),
        },
      ])
      const stored = await db.select().from(opsJobRuns).where(eq(opsJobRuns.status, 'interrupted'))
      expect(stored).toHaveLength(3)
      expect(
        stored.every(
          (run) => run.finishedAt?.getTime() === claimAt.getTime() && run.durationMs === null,
        ),
      ).toBe(true)
      expect(stored.find(({ id }) => id === cancelled.id)?.cancelRequestedByUserId).toBe(
        actor.userId,
      )
      const plans = await db.select().from(opsScheduledJobs)
      expect(plans.every(({ activeRunId }) => activeRunId === null)).toBe(true)
    },
  )
})

describe('scheduled job recovery, cancellation, and finalization', () => {
  const candidate = (
    overrides: Partial<ScheduledJobRecoveryCandidate> = {},
  ): ScheduledJobRecoveryCandidate => ({
    originalRunId: randomUUID(),
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
        candidate: candidate(),
        now: claimAt,
        executorId,
      })

      expect(result).toMatchObject({ kind: 'running', scheduledFor: null })
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
        candidate: candidate({ scheduledFor: dueAt }),
        now: claimAt,
        executorId,
      })
      expect(overlap).toMatchObject({
        kind: 'overlap',
        activeRunId: active.id,
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
          candidate: candidate({ taskKey: secondTask }),
          now: claimAt,
          executorId,
        }),
      ).resolves.toMatchObject({ kind: 'running' })
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

      await expect(repository.requestCancellation(input)).resolves.toMatchObject({
        kind: 'accepted',
        firstRequest: true,
      })
      await expect(
        repository.requestCancellation({ ...input, now: futureAt, actor: secondActor }),
      ).resolves.toMatchObject({ kind: 'accepted', firstRequest: false })
      const [stored] = await db.select().from(opsJobRuns).where(eq(opsJobRuns.id, active.id!))
      expect(stored).toMatchObject({
        cancelRequestedAt: claimAt,
        cancelRequestedByUserId: actor.userId,
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
    'lets an earlier cancel request win finalization and makes matching retries idempotent',
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
        candidate: {
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
      expect(plan?.activeRunId).toBeNull()
    },
  )

  dbTest('rejects cancellation after successful finalization wins the race', async ({ db }) => {
    const active = await occupy(db, runningRun(firstTask))
    const repository = createScheduledJobRepository(db)
    const finishedAt = new Date('2026-08-25T12:05:01.000Z')

    await repository.finalizeRun({
      taskKey: firstTask,
      runId: active.id!,
      candidate: {
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
    'persists a normal safe terminal candidate and rejects non-matching finalization',
    async ({ db }) => {
      const active = await occupy(db, runningRun(firstTask))
      const repository = createScheduledJobRepository(db)
      const finishedAt = new Date('2026-08-25T12:05:01.000Z')

      await expect(
        repository.finalizeRun({
          taskKey: firstTask,
          runId: active.id!,
          candidate: {
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
          candidate: {
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
