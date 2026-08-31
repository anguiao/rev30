import {
  type ScheduledJob,
  type ScheduledJobEnabledInput,
  type ScheduledJobListItem,
  type ScheduledJobManualExecuteResult,
  type ScheduledJobPlanUpdateInput,
  type ScheduledJobRunDetail,
  type ScheduledJobRunListResponse,
  type ScheduledJobRunsListQuery,
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
  toScheduledJob,
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
  'list' | 'findPlan' | 'listRuns' | 'findRun' | 'updatePlan' | 'updateEnabled'
>

function requireTaskDefinition(
  taskKey: string,
  definitions: ReturnType<ScheduledJobRuntimeCommands['listDefinitions']>,
) {
  const definition = definitions.find((item) => item.key === taskKey)
  if (!definition) throw new ScheduledJobNotFoundError()
  return definition
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

  async function get(taskKey: string): Promise<ScheduledJob> {
    const definitions = runtime.listDefinitions()
    const definition = requireTaskDefinition(taskKey, definitions)
    const plan = await repository.findPlan(definition.key)
    if (!plan) throw new ScheduledJobNotFoundError()

    return toScheduledJob(plan, definition)
  }

  async function updatePlan(taskKey: string, input: ScheduledJobPlanUpdateInput) {
    const definition = requireTaskDefinition(taskKey, runtime.listDefinitions())
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

    const plan = await repository.updatePlan({
      taskKey: definition.key,
      cronExpression: schedule.cronExpression,
      timezone: schedule.timezone,
      now: updatedAt,
    })
    runtime.wake()
    return toScheduledJob(plan, definition)
  }

  async function updateEnabled(taskKey: string, input: ScheduledJobEnabledInput) {
    const definition = requireTaskDefinition(taskKey, runtime.listDefinitions())
    const plan = await repository.updateEnabled({
      taskKey: definition.key,
      enabled: input.enabled,
      now: now(),
    })
    runtime.wake()
    return toScheduledJob(plan, definition)
  }

  async function runManual(
    taskKey: string,
    actor: ScheduledJobActorSnapshot,
  ): Promise<ScheduledJobManualExecuteResult> {
    const definition = requireTaskDefinition(taskKey, runtime.listDefinitions())
    const result = await runtime.runManual({ taskKey: definition.key, actor })
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
    const definition = requireTaskDefinition(taskKey, runtime.listDefinitions())
    const result = await repository.listRuns({ taskKey: definition.key, ...query })
    return {
      ...result,
      list: result.list.map(toScheduledJobRunListItem),
    }
  }

  async function getRun(taskKey: string, runId: string): Promise<ScheduledJobRunDetail> {
    const definition = requireTaskDefinition(taskKey, runtime.listDefinitions())
    const run = await repository.findRun(definition.key, runId)
    if (!run) throw new ScheduledJobNotFoundError()
    return toScheduledJobRunDetail(run)
  }

  async function cancel(taskKey: string, runId: string, actor: ScheduledJobActorSnapshot) {
    const definition = requireTaskDefinition(taskKey, runtime.listDefinitions())
    const result = await runtime.requestCancellation({
      taskKey: definition.key,
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

  return { list, get, updatePlan, updateEnabled, runManual, listRuns, getRun, cancel }
}

export type ScheduledJobService = ReturnType<typeof createScheduledJobService>
