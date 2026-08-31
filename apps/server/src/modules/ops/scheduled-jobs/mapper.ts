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

export type ScheduledJobPlanRow = typeof opsScheduledJobs.$inferSelect
export type ScheduledJobRunRow = typeof opsJobRuns.$inferSelect

function iso(value: Date | null) {
  return value === null ? null : toIsoDateTime(value)
}

function runSummaryFields(row: ScheduledJobRunRow) {
  return {
    id: row.id,
    triggerSource: row.triggerSource,
    status: row.status,
    scheduledFor: iso(row.scheduledFor),
    startedAt: iso(row.startedAt),
    finishedAt: iso(row.finishedAt),
    durationMs: row.durationMs,
    cancelRequestedAt: iso(row.cancelRequestedAt),
  }
}

export function toScheduledJobCurrentRunSummary(
  row: ScheduledJobRunRow,
): ScheduledJobCurrentRunSummary {
  return runSummaryFields(row) as ScheduledJobCurrentRunSummary
}

export function toScheduledJobLatestRunSummary(
  row: ScheduledJobRunRow,
): ScheduledJobLatestRunSummary {
  return runSummaryFields(row) as ScheduledJobLatestRunSummary
}

export function toScheduledJob(
  plan: ScheduledJobPlanRow,
  definition: Pick<RegistryDefinition, 'key' | 'name' | 'description'>,
): ScheduledJob {
  return {
    taskKey: definition.key,
    name: definition.name,
    description: definition.description,
    cronExpression: plan.cronExpression,
    timezone: plan.timezone,
    enabled: plan.enabled,
    nextRunAt: iso(plan.nextRunAt),
  }
}

export function toScheduledJobListItem(
  plan: ScheduledJobPlanRow,
  definition: Pick<RegistryDefinition, 'key' | 'name' | 'description'>,
  currentRun: ScheduledJobRunRow | null,
  lastRun: ScheduledJobRunRow | null,
): ScheduledJobListItem {
  return {
    ...toScheduledJob(plan, definition),
    currentRun: currentRun ? toScheduledJobCurrentRunSummary(currentRun) : null,
    lastRun: lastRun ? toScheduledJobLatestRunSummary(lastRun) : null,
  }
}

export function toScheduledJobRunListItem(row: ScheduledJobRunRow): ScheduledJobRunListItem {
  return {
    id: row.id,
    taskKey: row.taskKey as ScheduledJobTaskKey,
    triggerSource: row.triggerSource,
    status: row.status,
    skipReason: row.skipReason,
    scheduledFor: iso(row.scheduledFor),
    executorId: row.executorId,
    deletedCount: row.deletedCount,
    failedCount: row.failedCount,
    errorCategory: row.errorCategory,
    errorSummary: row.errorSummary,
    startedAt: iso(row.startedAt),
    finishedAt: iso(row.finishedAt),
    durationMs: row.durationMs,
    createdAt: toIsoDateTime(row.createdAt),
    updatedAt: toIsoDateTime(row.updatedAt),
  } as ScheduledJobRunListItem
}

export function toScheduledJobRunDetail(row: ScheduledJobRunRow): ScheduledJobRunDetail {
  return {
    id: row.id,
    taskKey: row.taskKey as ScheduledJobTaskKey,
    triggerSource: row.triggerSource,
    status: row.status,
    skipReason: row.skipReason,
    scheduledFor: iso(row.scheduledFor),
    executorId: row.executorId,
    deletedCount: row.deletedCount,
    failedCount: row.failedCount,
    errorCategory: row.errorCategory,
    errorSummary: row.errorSummary,
    triggeredByUserId: row.triggeredByUserId,
    triggeredByUsername: row.triggeredByUsername,
    triggeredByNickname: row.triggeredByNickname,
    triggeredBySessionId: row.triggeredBySessionId,
    triggerRequestId: row.triggerRequestId,
    cancelRequestedAt: iso(row.cancelRequestedAt),
    cancelRequestedByUserId: row.cancelRequestedByUserId,
    cancelRequestedByUsername: row.cancelRequestedByUsername,
    cancelRequestedByNickname: row.cancelRequestedByNickname,
    cancelRequestedBySessionId: row.cancelRequestedBySessionId,
    cancelRequestId: row.cancelRequestId,
    startedAt: iso(row.startedAt),
    finishedAt: iso(row.finishedAt),
    durationMs: row.durationMs,
    createdAt: toIsoDateTime(row.createdAt),
    updatedAt: toIsoDateTime(row.updatedAt),
  } as ScheduledJobRunDetail
}

export type ScheduledJobDefinitionMetadata = Pick<
  RegistryDefinition,
  'key' | 'name' | 'description'
>
