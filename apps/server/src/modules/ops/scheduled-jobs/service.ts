import {
  type ScheduledJob,
  type ScheduledJobEnabledInput,
  type ScheduledJobListItem,
  type ScheduledJobManualExecuteResult,
  type ScheduledJobPlanUpdateInput,
  type ScheduledJobRunDetail,
  type ScheduledJobRunListResponse,
  type ScheduledJobRunsListQuery,
  type User,
} from '@rev30/contracts'
import { parseCronSchedule, type CronSchedule } from '@rev30/utils'
import { ScheduledJobInvalidPlanError, ScheduledJobNotFoundError } from './errors'
import {
  toScheduledJob,
  toScheduledJobCurrentRunSummary,
  toScheduledJobListItem,
  toScheduledJobRunDetail,
  toScheduledJobRunListItem,
} from './mapper'
import type { ScheduledJobRepository } from './repository'
import type { ScheduledJobDefinition } from './registry'
import type { ScheduledJobScheduler } from './scheduler'

type ServiceOptions = {
  definitions: readonly Pick<ScheduledJobDefinition, 'key' | 'name' | 'description'>[]
  repository: ScheduledJobRepository
  scheduler: ScheduledJobScheduler
}

export function createScheduledJobService(options: ServiceOptions) {
  const { definitions, repository, scheduler } = options
  const definitionByKey = new Map(definitions.map((definition) => [definition.key, definition]))

  function requireTaskDefinition(taskKey: string) {
    const definition = definitionByKey.get(taskKey)
    if (!definition) throw new ScheduledJobNotFoundError()
    return definition
  }

  async function list(): Promise<ScheduledJobListItem[]> {
    const result = await repository.list()
    const plansByTask = new Map(result.plans.map((plan) => [plan.taskKey, plan]))
    const currentRunsById = new Map(result.currentRuns.map((run) => [run.id, run]))
    const lastRunsByTask = new Map(result.lastRuns.map((run) => [run.taskKey, run]))

    return definitions.map((definition) => {
      const plan = plansByTask.get(definition.key)
      if (!plan) throw new Error(`Scheduled job plan missing: ${definition.key}`)
      const currentRun =
        plan.activeRunId === null ? null : (currentRunsById.get(plan.activeRunId) ?? null)
      const lastRun = lastRunsByTask.get(definition.key) ?? null
      return toScheduledJobListItem(plan, definition, currentRun, lastRun)
    })
  }

  async function get(taskKey: string): Promise<ScheduledJob> {
    const definition = requireTaskDefinition(taskKey)
    const plan = await repository.findPlan(definition.key)
    if (!plan) throw new ScheduledJobNotFoundError()

    return toScheduledJob(plan, definition)
  }

  async function updatePlan(taskKey: string, input: ScheduledJobPlanUpdateInput) {
    const definition = requireTaskDefinition(taskKey)
    const updatedAt = new Date()
    let schedule: CronSchedule
    try {
      schedule = parseCronSchedule(
        {
          expression: input.cronExpression,
          timezone: input.timezone,
        },
        updatedAt,
      )
    } catch {
      throw new ScheduledJobInvalidPlanError()
    }

    const plan = await repository.updatePlan({
      taskKey: definition.key,
      schedule,
      now: updatedAt,
    })
    scheduler.wake()
    return toScheduledJob(plan, definition)
  }

  async function updateEnabled(taskKey: string, input: ScheduledJobEnabledInput) {
    const definition = requireTaskDefinition(taskKey)
    const plan = await repository.updateEnabled({
      taskKey: definition.key,
      enabled: input.enabled,
      now: new Date(),
    })
    scheduler.wake()
    return toScheduledJob(plan, definition)
  }

  async function runManual(
    taskKey: string,
    actor: Pick<User, 'id' | 'nickname' | 'username'>,
  ): Promise<ScheduledJobManualExecuteResult> {
    const definition = requireTaskDefinition(taskKey)
    const result = await scheduler.runManual({ taskKey: definition.key, actor })
    if (result.blockedByRunId !== null) {
      return {
        skippedRunId: result.runId,
        activeRunId: result.blockedByRunId,
      }
    }
    return { runId: result.runId }
  }

  async function listRuns(
    taskKey: string,
    query: ScheduledJobRunsListQuery,
  ): Promise<ScheduledJobRunListResponse> {
    const definition = requireTaskDefinition(taskKey)
    const result = await repository.listRuns({ taskKey: definition.key, ...query })
    return {
      ...result,
      list: result.list.map(toScheduledJobRunListItem),
    }
  }

  async function getRun(taskKey: string, runId: string): Promise<ScheduledJobRunDetail> {
    const definition = requireTaskDefinition(taskKey)
    const run = await repository.findRun(definition.key, runId)
    if (!run) throw new ScheduledJobNotFoundError()
    return toScheduledJobRunDetail(run)
  }

  async function cancel(
    taskKey: string,
    runId: string,
    actor: Pick<User, 'id' | 'nickname' | 'username'>,
  ) {
    const definition = requireTaskDefinition(taskKey)
    const run = await scheduler.requestCancellation({
      taskKey: definition.key,
      runId,
      actor,
    })
    return { run: toScheduledJobCurrentRunSummary(run) }
  }

  return { list, get, updatePlan, updateEnabled, runManual, listRuns, getRun, cancel }
}

export type ScheduledJobService = ReturnType<typeof createScheduledJobService>
