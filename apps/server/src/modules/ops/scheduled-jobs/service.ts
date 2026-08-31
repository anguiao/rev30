import {
  scheduledJobTaskKeySchema,
  type ScheduledJobEnabledInput,
  type ScheduledJobListItem,
  type ScheduledJobManualExecuteResult,
  type ScheduledJobPlanUpdateInput,
  type ScheduledJobRunDetail,
  type ScheduledJobRunListResponse,
  type ScheduledJobRunsListQuery,
  type ScheduledJobTaskKey,
} from '@rev30/contracts'
import { parseCronSchedule } from '@rev30/utils'
import type { Db } from '../../../db'
import {
  ScheduledJobNotFoundError,
  ScheduledJobStateConflictError,
  createScheduledJobRepository,
  type ScheduledJobActorSnapshot,
} from './repository'
import {
  toScheduledJobListItem,
  toScheduledJobRunDetail,
  toScheduledJobRunListItem,
  type ScheduledJobRunRow,
} from './mapper'
import { ScheduledJobInvalidPlanError } from './errors'
import type { ScheduledJobRuntimeCommands } from './runtime'

type Repository = ReturnType<typeof createScheduledJobRepository>
type ServiceRepository = Pick<
  Repository,
  'list' | 'listRuns' | 'findRun' | 'updatePlan' | 'updateEnabled'
>

function assertKnownTask(
  taskKey: string,
  definitions: ReturnType<ScheduledJobRuntimeCommands['listDefinitions']>,
): ScheduledJobTaskKey {
  const parsed = scheduledJobTaskKeySchema.safeParse(taskKey)
  if (!parsed.success || !definitions.some((definition) => definition.key === parsed.data)) {
    throw new ScheduledJobNotFoundError()
  }
  return parsed.data
}

export type ScheduledJobServiceOptions = {
  repository?: ServiceRepository
  now?: () => Date
}

export function createScheduledJobService(
  database: Db,
  runtime: ScheduledJobRuntimeCommands,
  options: ScheduledJobServiceOptions = {},
) {
  const repository = options.repository ?? createScheduledJobRepository(database)
  const now = options.now ?? (() => new Date())

  async function list(): Promise<ScheduledJobListItem[]> {
    const result = await repository.list()
    const currentRunsByTask = new Map<string, ScheduledJobRunRow>()
    for (const run of result.currentRuns) {
      currentRunsByTask.set(run.taskKey, run)
    }
    const lastRunsByTask = new Map<string, ScheduledJobRunRow>()
    for (const run of result.lastRuns) {
      lastRunsByTask.set(run.taskKey, run)
    }

    return runtime.listDefinitions().map((definition) => {
      const plan = result.plans.find((item) => item.taskKey === definition.key)
      if (!plan) throw new Error(`Scheduled job plan missing: ${definition.key}`)
      const currentRun =
        plan.activeRunId === null
          ? null
          : currentRunsByTask.get(definition.key)?.id === plan.activeRunId
            ? (currentRunsByTask.get(definition.key) ?? null)
            : null
      const lastRun = lastRunsByTask.get(definition.key) ?? null
      return toScheduledJobListItem(plan, definition, currentRun, lastRun)
    })
  }

  async function updatePlan(taskKey: string, input: ScheduledJobPlanUpdateInput) {
    const parsedTaskKey = assertKnownTask(taskKey, runtime.listDefinitions())
    const updatedAt = now()
    let schedule: ScheduledJobPlanUpdateInput
    try {
      const normalized = parseCronSchedule(
        {
          expression: input.cronExpression,
          timezone: input.timezone,
        },
        updatedAt,
      )
      schedule = {
        cronExpression: normalized.expression,
        timezone: normalized.timezone,
      }
    } catch {
      throw new ScheduledJobInvalidPlanError()
    }

    await repository.updatePlan({
      taskKey: parsedTaskKey,
      cronExpression: schedule.cronExpression,
      timezone: schedule.timezone,
      now: updatedAt,
    })
    runtime.wake()
    return (await list()).find((item) => item.taskKey === parsedTaskKey)!
  }

  async function updateEnabled(taskKey: string, input: ScheduledJobEnabledInput) {
    const parsedTaskKey = assertKnownTask(taskKey, runtime.listDefinitions())
    await repository.updateEnabled({
      taskKey: parsedTaskKey,
      enabled: input.enabled,
      now: now(),
    })
    runtime.wake()
    return (await list()).find((item) => item.taskKey === parsedTaskKey)!
  }

  async function runManual(
    taskKey: string,
    actor: ScheduledJobActorSnapshot,
  ): Promise<ScheduledJobManualExecuteResult> {
    const parsedTaskKey = assertKnownTask(taskKey, runtime.listDefinitions())
    const result = await runtime.runManual({ taskKey: parsedTaskKey, actor })
    if (result.kind === 'not-found') throw new ScheduledJobNotFoundError()
    if (result.kind === 'overlap') {
      return {
        skippedRunId: result.runId,
        activeRunId: result.activeRunId,
      }
    }
    return { runId: result.runId }
  }

  async function listRuns(
    taskKey: string,
    query: ScheduledJobRunsListQuery,
  ): Promise<ScheduledJobRunListResponse> {
    const parsedTaskKey = assertKnownTask(taskKey, runtime.listDefinitions())
    const result = await repository.listRuns({ taskKey: parsedTaskKey, ...query })
    return {
      ...result,
      list: result.list.map(toScheduledJobRunListItem),
    }
  }

  async function getRun(taskKey: string, runId: string): Promise<ScheduledJobRunDetail> {
    const parsedTaskKey = assertKnownTask(taskKey, runtime.listDefinitions())
    const run = await repository.findRun(parsedTaskKey, runId)
    if (!run) throw new ScheduledJobNotFoundError()
    return toScheduledJobRunDetail(run)
  }

  async function cancel(taskKey: string, runId: string, actor: ScheduledJobActorSnapshot) {
    const parsedTaskKey = assertKnownTask(taskKey, runtime.listDefinitions())
    const result = await runtime.requestCancellation({
      taskKey: parsedTaskKey,
      runId,
      actor,
    })
    if (result.kind !== 'accepted') {
      throw new ScheduledJobStateConflictError()
    }
    const run = result.run
    return {
      run: {
        id: run.id,
        triggerSource: run.triggerSource,
        status: run.status,
        scheduledFor: run.scheduledFor?.toISOString() ?? null,
        startedAt: run.startedAt?.toISOString() ?? null,
        finishedAt: run.finishedAt?.toISOString() ?? null,
        durationMs: run.durationMs,
        cancelRequestedAt: run.cancelRequestedAt?.toISOString() ?? null,
      },
    }
  }

  return { list, updatePlan, updateEnabled, runManual, listRuns, getRun, cancel }
}

export type ScheduledJobService = ReturnType<typeof createScheduledJobService>
