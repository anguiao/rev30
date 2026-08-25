import type { ScheduledJobErrorCategory, ScheduledJobTaskKey } from '@rev30/contracts'
import { getNextCronOccurrences, validateCronSchedule } from '@rev30/utils'
import { and, asc, desc, eq, ne, type AnyRelations } from 'drizzle-orm'
import type { PgAsyncDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import type { Db, DbExecutor, DbReader } from '../../../db'
import { opsJobRuns, opsScheduledJobs } from '../../../db/schema'
import type { ScheduledJobRegistry } from './registry'

export type ScheduledJobActorSnapshot = {
  userId: string
  username: string
  nickname: string
  sessionId: string
  requestId: string
}

export type ScheduledJobRecoveryCandidate = {
  originalRunId: string
  taskKey: ScheduledJobTaskKey
  scheduledFor: Date | null
  startedAt: Date
}

export type ScheduledJobClaimResult =
  | { kind: 'stale' }
  | { kind: 'running'; runId: string; scheduledFor: Date | null }
  | {
      kind: 'overlap'
      runId: string
      activeRunId: string
      scheduledFor: Date | null
    }

export type ScheduledJobManualClaimResult =
  | { kind: 'not-found' }
  | Exclude<ScheduledJobClaimResult, { kind: 'stale' }>

export type ScheduledJobFinalizeCandidate =
  | {
      status: 'success'
      finishedAt: Date
      durationMs: number
      deletedCount: number
      failedCount: 0
    }
  | {
      status: 'failure'
      finishedAt: Date
      durationMs: number
      deletedCount: number | null
      failedCount: number | null
      errorCategory: ScheduledJobErrorCategory
      errorSummary: string
    }

export class ScheduledJobStateConflictError extends Error {
  constructor() {
    super('Scheduled job state conflicts with the requested transition')
    this.name = 'ScheduledJobStateConflictError'
  }
}

export class ScheduledJobNotFoundError extends Error {
  constructor() {
    super('Scheduled job or run was not found')
    this.name = 'ScheduledJobNotFoundError'
  }
}

function nextOccurrence(plan: typeof opsScheduledJobs.$inferSelect, now: Date) {
  return getNextCronOccurrences({
    expression: plan.cronExpression,
    timezone: plan.timezone,
    from: now,
    count: 1,
  })[0]!
}

async function lockPlan(executor: DbReader, taskKey: string) {
  const [plan] = await executor
    .select()
    .from(opsScheduledJobs)
    .where(eq(opsScheduledJobs.taskKey, taskKey))
    .limit(1)
    .for('update')
  return plan
}

function actorValues(actor: ScheduledJobActorSnapshot) {
  return {
    triggeredByUserId: actor.userId,
    triggeredByUsername: actor.username,
    triggeredByNickname: actor.nickname,
    triggeredBySessionId: actor.sessionId,
    triggerRequestId: actor.requestId,
  }
}

function cancellationValues(actor: ScheduledJobActorSnapshot, now: Date) {
  return {
    cancelRequestedAt: now,
    cancelRequestedByUserId: actor.userId,
    cancelRequestedByUsername: actor.username,
    cancelRequestedByNickname: actor.nickname,
    cancelRequestedBySessionId: actor.sessionId,
    cancelRequestId: actor.requestId,
  }
}

function sameDate(left: Date | null, right: Date | null) {
  return left?.getTime() === right?.getTime()
}

async function insertRun(executor: DbExecutor, values: typeof opsJobRuns.$inferInsert) {
  const insertExecutor = executor as unknown as PgAsyncDatabase<PgQueryResultHKT, AnyRelations>
  const [inserted] = await insertExecutor
    .insert(opsJobRuns)
    .values(values)
    .returning({ id: opsJobRuns.id })
  return inserted!.id
}

export function createScheduledJobRepository(database: Db) {
  return {
    async initialize(input: { registry: ScheduledJobRegistry; startupAt: Date }) {
      return await database.transaction(async (tx) => {
        const plans = await tx
          .select()
          .from(opsScheduledJobs)
          .orderBy(asc(opsScheduledJobs.taskKey))
          .for('update')
        const registryKeys = [...input.registry.keys()].sort()
        const planKeys = plans.map(({ taskKey }) => taskKey).sort()

        if (
          registryKeys.length !== planKeys.length ||
          registryKeys.some((key, index) => key !== planKeys[index])
        ) {
          throw new Error('Scheduled Job Registry 与数据库计划集合不一致')
        }

        for (const plan of plans) {
          validateCronSchedule({ expression: plan.cronExpression, timezone: plan.timezone })
          if (
            (plan.enabled && plan.nextRunAt === null) ||
            (!plan.enabled && plan.nextRunAt !== null)
          ) {
            throw new Error(`Scheduled job plan shape is invalid: ${plan.taskKey}`)
          }
        }

        const runningRuns = await tx
          .select()
          .from(opsJobRuns)
          .where(eq(opsJobRuns.status, 'running'))
          .orderBy(asc(opsJobRuns.taskKey))
          .for('update')
        const runningById = new Map(runningRuns.map((run) => [run.id, run]))
        const referencedRunningIds = new Set<string>()

        for (const plan of plans) {
          if (plan.activeRunId === null) continue
          const run = runningById.get(plan.activeRunId)
          if (!run || run.taskKey !== plan.taskKey) {
            throw new Error('Scheduled job 运行状态不一致')
          }
          referencedRunningIds.add(run.id)
        }

        if (runningRuns.some((run) => !referencedRunningIds.has(run.id))) {
          throw new Error('Scheduled job 运行状态不一致')
        }

        for (const run of runningRuns) {
          await tx
            .update(opsJobRuns)
            .set({ status: 'interrupted', finishedAt: input.startupAt, updatedAt: input.startupAt })
            .where(eq(opsJobRuns.id, run.id))
        }
        for (const plan of plans) {
          if (plan.activeRunId === null) continue
          await tx
            .update(opsScheduledJobs)
            .set({ activeRunId: null, updatedAt: input.startupAt })
            .where(eq(opsScheduledJobs.taskKey, plan.taskKey))
        }

        const realRuns = await tx
          .select()
          .from(opsJobRuns)
          .where(ne(opsJobRuns.status, 'skipped'))
          .orderBy(asc(opsJobRuns.taskKey), desc(opsJobRuns.createdAt), desc(opsJobRuns.id))
        const latestByTask = new Map<string, (typeof realRuns)[number]>()
        for (const run of realRuns) {
          if (!latestByTask.has(run.taskKey)) latestByTask.set(run.taskKey, run)
        }

        return [...latestByTask.values()]
          .filter(
            (run): run is typeof run & { startedAt: Date } =>
              run.status === 'interrupted' &&
              run.cancelRequestedAt === null &&
              run.startedAt !== null,
          )
          .map((run): ScheduledJobRecoveryCandidate => ({
            originalRunId: run.id,
            taskKey: run.taskKey as ScheduledJobTaskKey,
            scheduledFor: run.scheduledFor,
            startedAt: run.startedAt,
          }))
          .sort(
            (left, right) =>
              left.startedAt.getTime() - right.startedAt.getTime() ||
              left.taskKey.localeCompare(right.taskKey),
          )
      })
    },

    async claimScheduled(input: {
      taskKey: ScheduledJobTaskKey
      now: Date
      executorId: string
    }): Promise<ScheduledJobClaimResult> {
      return await database.transaction(async (tx) => {
        const plan = await lockPlan(tx, input.taskKey)
        if (
          !plan ||
          !plan.enabled ||
          plan.nextRunAt === null ||
          plan.nextRunAt.getTime() > input.now.getTime()
        ) {
          return { kind: 'stale' }
        }

        const scheduledFor = plan.nextRunAt
        const nextRunAt = nextOccurrence(plan, input.now)
        if (plan.activeRunId !== null) {
          const runId = await insertRun(tx, {
            taskKey: input.taskKey,
            triggerSource: 'scheduled',
            status: 'skipped',
            skipReason: 'overlap',
            scheduledFor,
            finishedAt: input.now,
            createdAt: input.now,
            updatedAt: input.now,
          })
          await tx
            .update(opsScheduledJobs)
            .set({ nextRunAt, updatedAt: input.now })
            .where(eq(opsScheduledJobs.taskKey, input.taskKey))
          return {
            kind: 'overlap',
            runId,
            activeRunId: plan.activeRunId,
            scheduledFor,
          }
        }

        const runId = await insertRun(tx, {
          taskKey: input.taskKey,
          triggerSource: 'scheduled',
          status: 'running',
          scheduledFor,
          executorId: input.executorId,
          startedAt: input.now,
          createdAt: input.now,
          updatedAt: input.now,
        })
        await tx
          .update(opsScheduledJobs)
          .set({ activeRunId: runId, nextRunAt, updatedAt: input.now })
          .where(eq(opsScheduledJobs.taskKey, input.taskKey))
        return { kind: 'running', runId, scheduledFor }
      })
    },

    async claimManual(input: {
      taskKey: string
      now: Date
      executorId: string
      actor: ScheduledJobActorSnapshot
    }): Promise<ScheduledJobManualClaimResult> {
      return await database.transaction(async (tx) => {
        const plan = await lockPlan(tx, input.taskKey)
        if (!plan) return { kind: 'not-found' }

        if (plan.activeRunId !== null) {
          const runId = await insertRun(tx, {
            taskKey: plan.taskKey,
            triggerSource: 'manual',
            status: 'skipped',
            skipReason: 'overlap',
            finishedAt: input.now,
            createdAt: input.now,
            updatedAt: input.now,
            ...actorValues(input.actor),
          })
          return {
            kind: 'overlap',
            runId,
            activeRunId: plan.activeRunId,
            scheduledFor: null,
          }
        }

        const runId = await insertRun(tx, {
          taskKey: plan.taskKey,
          triggerSource: 'manual',
          status: 'running',
          executorId: input.executorId,
          startedAt: input.now,
          createdAt: input.now,
          updatedAt: input.now,
          ...actorValues(input.actor),
        })
        await tx
          .update(opsScheduledJobs)
          .set({ activeRunId: runId, updatedAt: input.now })
          .where(eq(opsScheduledJobs.taskKey, plan.taskKey))
        return { kind: 'running', runId, scheduledFor: null }
      })
    },

    async claimRecovery(input: {
      candidate: ScheduledJobRecoveryCandidate
      now: Date
      executorId: string
    }): Promise<Exclude<ScheduledJobClaimResult, { kind: 'stale' }>> {
      return await database.transaction(async (tx) => {
        const plan = await lockPlan(tx, input.candidate.taskKey)
        if (!plan) throw new ScheduledJobStateConflictError()
        const nextRunAt =
          plan.enabled && plan.nextRunAt !== null && plan.nextRunAt.getTime() <= input.now.getTime()
            ? nextOccurrence(plan, input.now)
            : plan.nextRunAt

        if (plan.activeRunId !== null) {
          const runId = await insertRun(tx, {
            taskKey: input.candidate.taskKey,
            triggerSource: 'recovery',
            status: 'skipped',
            skipReason: 'overlap',
            scheduledFor: input.candidate.scheduledFor,
            finishedAt: input.now,
            createdAt: input.now,
            updatedAt: input.now,
          })
          if (!sameDate(nextRunAt, plan.nextRunAt)) {
            await tx
              .update(opsScheduledJobs)
              .set({ nextRunAt, updatedAt: input.now })
              .where(eq(opsScheduledJobs.taskKey, plan.taskKey))
          }
          return {
            kind: 'overlap',
            runId,
            activeRunId: plan.activeRunId,
            scheduledFor: input.candidate.scheduledFor,
          }
        }

        const runId = await insertRun(tx, {
          taskKey: input.candidate.taskKey,
          triggerSource: 'recovery',
          status: 'running',
          scheduledFor: input.candidate.scheduledFor,
          executorId: input.executorId,
          startedAt: input.now,
          createdAt: input.now,
          updatedAt: input.now,
        })
        await tx
          .update(opsScheduledJobs)
          .set({ activeRunId: runId, nextRunAt, updatedAt: input.now })
          .where(eq(opsScheduledJobs.taskKey, plan.taskKey))
        return { kind: 'running', runId, scheduledFor: input.candidate.scheduledFor }
      })
    },

    async requestCancellation(input: {
      taskKey: ScheduledJobTaskKey
      runId: string
      now: Date
      actor: ScheduledJobActorSnapshot
    }) {
      return await database.transaction(async (tx) => {
        const plan = await lockPlan(tx, input.taskKey)
        if (!plan) throw new ScheduledJobNotFoundError()
        const [run] = await tx
          .select()
          .from(opsJobRuns)
          .where(and(eq(opsJobRuns.id, input.runId), eq(opsJobRuns.taskKey, input.taskKey)))
          .limit(1)
          .for('update')
        if (!run) throw new ScheduledJobNotFoundError()
        if (plan.activeRunId !== run.id || run.status !== 'running') {
          throw new ScheduledJobStateConflictError()
        }
        if (run.cancelRequestedAt !== null) {
          return { kind: 'accepted' as const, firstRequest: false, run }
        }

        const [updated] = await tx
          .update(opsJobRuns)
          .set({ ...cancellationValues(input.actor, input.now), updatedAt: input.now })
          .where(eq(opsJobRuns.id, run.id))
          .returning()
        return { kind: 'accepted' as const, firstRequest: true, run: updated! }
      })
    },

    async finalizeRun(input: {
      taskKey: ScheduledJobTaskKey
      runId: string
      candidate: ScheduledJobFinalizeCandidate
    }) {
      return await database.transaction(async (tx) => {
        const plan = await lockPlan(tx, input.taskKey)
        if (!plan) throw new ScheduledJobStateConflictError()
        const [run] = await tx
          .select()
          .from(opsJobRuns)
          .where(and(eq(opsJobRuns.id, input.runId), eq(opsJobRuns.taskKey, input.taskKey)))
          .limit(1)
          .for('update')
        if (!run) throw new ScheduledJobStateConflictError()

        const cancelled = run.cancelRequestedAt !== null
        const status = cancelled ? ('cancelled' as const) : input.candidate.status
        const errorCategory =
          !cancelled && input.candidate.status === 'failure' ? input.candidate.errorCategory : null
        const errorSummary =
          !cancelled && input.candidate.status === 'failure' ? input.candidate.errorSummary : null

        if (run.status !== 'running') {
          const matches =
            plan.activeRunId === null &&
            run.status === status &&
            sameDate(run.finishedAt, input.candidate.finishedAt) &&
            run.durationMs === input.candidate.durationMs &&
            run.deletedCount === input.candidate.deletedCount &&
            run.failedCount === input.candidate.failedCount &&
            run.errorCategory === errorCategory &&
            run.errorSummary === errorSummary
          if (!matches) throw new ScheduledJobStateConflictError()
          return run
        }
        if (plan.activeRunId !== run.id) throw new ScheduledJobStateConflictError()

        const [updated] = await tx
          .update(opsJobRuns)
          .set({
            status,
            finishedAt: input.candidate.finishedAt,
            durationMs: input.candidate.durationMs,
            deletedCount: input.candidate.deletedCount,
            failedCount: input.candidate.failedCount,
            errorCategory,
            errorSummary,
            updatedAt: input.candidate.finishedAt,
          })
          .where(eq(opsJobRuns.id, run.id))
          .returning()
        await tx
          .update(opsScheduledJobs)
          .set({ activeRunId: null, updatedAt: input.candidate.finishedAt })
          .where(eq(opsScheduledJobs.taskKey, input.taskKey))
        return updated!
      })
    },
  }
}
