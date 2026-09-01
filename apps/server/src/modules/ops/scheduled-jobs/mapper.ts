import type {
  ScheduledJob,
  ScheduledJobCurrentRunSummary,
  ScheduledJobLatestRunSummary,
  ScheduledJobListItem,
  ScheduledJobRunDetail,
  ScheduledJobRunListItem,
  ScheduledJobTaskKey,
} from '@rev30/contracts'
import { toIsoDateTime } from '@rev30/utils'
import { opsJobRuns, opsScheduledJobs } from '../../../db/schema'
import type { ScheduledJobDefinition as RegistryDefinition } from './registry'

type PlanRow = typeof opsScheduledJobs.$inferSelect
type RunRow = typeof opsJobRuns.$inferSelect

function toNullableIsoDateTime(value: Date | null) {
  return value === null ? null : toIsoDateTime(value)
}

function runSummaryFields(row: RunRow) {
  return {
    id: row.id,
    triggerSource: row.triggerSource,
    status: row.status,
    scheduledFor: toNullableIsoDateTime(row.scheduledFor),
    startedAt: toNullableIsoDateTime(row.startedAt),
    finishedAt: toNullableIsoDateTime(row.finishedAt),
    durationMs: row.durationMs,
    cancelRequestedAt: toNullableIsoDateTime(row.cancelRequestedAt),
  }
}

export function toScheduledJobCurrentRunSummary(row: RunRow): ScheduledJobCurrentRunSummary {
  return runSummaryFields(row) as ScheduledJobCurrentRunSummary
}

export function toScheduledJobLatestRunSummary(row: RunRow): ScheduledJobLatestRunSummary {
  return runSummaryFields(row) as ScheduledJobLatestRunSummary
}

export function toScheduledJob(
  plan: PlanRow,
  definition: Pick<RegistryDefinition, 'key' | 'name' | 'description'>,
): ScheduledJob {
  return {
    taskKey: definition.key,
    name: definition.name,
    description: definition.description,
    cronExpression: plan.cronExpression,
    timezone: plan.timezone,
    enabled: plan.enabled,
    nextRunAt: toNullableIsoDateTime(plan.nextRunAt),
  }
}

export function toScheduledJobListItem(
  plan: PlanRow,
  definition: Pick<RegistryDefinition, 'key' | 'name' | 'description'>,
  currentRun: RunRow | null,
  lastRun: RunRow | null,
): ScheduledJobListItem {
  return {
    ...toScheduledJob(plan, definition),
    currentRun: currentRun ? toScheduledJobCurrentRunSummary(currentRun) : null,
    lastRun: lastRun ? toScheduledJobLatestRunSummary(lastRun) : null,
  }
}

export function toScheduledJobRunListItem(row: RunRow): ScheduledJobRunListItem {
  return {
    id: row.id,
    taskKey: row.taskKey as ScheduledJobTaskKey,
    triggerSource: row.triggerSource,
    status: row.status,
    scheduledFor: toNullableIsoDateTime(row.scheduledFor),
    deletedCount: row.deletedCount,
    failedCount: row.failedCount,
    errorCategory: row.errorCategory,
    errorSummary: row.errorSummary,
    startedAt: toNullableIsoDateTime(row.startedAt),
    finishedAt: toNullableIsoDateTime(row.finishedAt),
    durationMs: row.durationMs,
    createdAt: toIsoDateTime(row.createdAt),
  } as ScheduledJobRunListItem
}

export function toScheduledJobRunDetail(row: RunRow): ScheduledJobRunDetail {
  return {
    id: row.id,
    taskKey: row.taskKey as ScheduledJobTaskKey,
    triggerSource: row.triggerSource,
    status: row.status,
    scheduledFor: toNullableIsoDateTime(row.scheduledFor),
    deletedCount: row.deletedCount,
    failedCount: row.failedCount,
    errorCategory: row.errorCategory,
    errorSummary: row.errorSummary,
    triggeredByUserId: row.triggeredByUserId,
    triggeredByUsername: row.triggeredByUsername,
    triggeredByNickname: row.triggeredByNickname,
    cancelRequestedAt: toNullableIsoDateTime(row.cancelRequestedAt),
    cancelRequestedByUserId: row.cancelRequestedByUserId,
    cancelRequestedByUsername: row.cancelRequestedByUsername,
    cancelRequestedByNickname: row.cancelRequestedByNickname,
    startedAt: toNullableIsoDateTime(row.startedAt),
    finishedAt: toNullableIsoDateTime(row.finishedAt),
    durationMs: row.durationMs,
    createdAt: toIsoDateTime(row.createdAt),
  } as ScheduledJobRunDetail
}
