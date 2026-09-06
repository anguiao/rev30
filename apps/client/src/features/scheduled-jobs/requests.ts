import {
  type ScheduledJobCancelResponse,
  type ScheduledJobEnabledInput,
  type ScheduledJob,
  type ScheduledJobListResponse,
  type ScheduledJobManualExecuteResult,
  type ScheduledJobPlanUpdateInput,
  type ScheduledJobRunDetail,
  type ScheduledJobRunListResponse,
  type ScheduledJobRunsListQuery,
  scheduledJobCancelResponseSchema,
  scheduledJobListResponseSchema,
  scheduledJobManualExecuteResultSchema,
  scheduledJobPlanUpdateInputSchema,
  scheduledJobRunDetailSchema,
  scheduledJobRunListResponseSchema,
  scheduledJobSchema,
} from '@rev30/contracts'
import { api } from '../../api'
import { normalizeRequestQuery, parseApiResponse } from '../../utils/request'

export async function listScheduledJobs(): Promise<ScheduledJobListResponse> {
  return parseApiResponse(await api.ops['scheduled-jobs'].$get(), scheduledJobListResponseSchema)
}

export async function getScheduledJob(taskKey: string): Promise<ScheduledJob> {
  return parseApiResponse(
    await api.ops['scheduled-jobs'][':taskKey'].$get({ param: { taskKey } }),
    scheduledJobSchema,
  )
}

export async function updateScheduledJob(
  taskKey: string,
  input: ScheduledJobPlanUpdateInput,
): Promise<ScheduledJob> {
  return parseApiResponse(
    await api.ops['scheduled-jobs'][':taskKey'].$put({
      param: { taskKey },
      json: scheduledJobPlanUpdateInputSchema.parse(input),
    }),
    scheduledJobSchema,
  )
}

export async function updateScheduledJobEnabled(
  taskKey: string,
  enabled: boolean,
): Promise<ScheduledJob> {
  return parseApiResponse(
    await api.ops['scheduled-jobs'][':taskKey'].enabled.$put({
      param: { taskKey },
      json: { enabled } satisfies ScheduledJobEnabledInput,
    }),
    scheduledJobSchema,
  )
}

export async function executeScheduledJob(
  taskKey: string,
): Promise<ScheduledJobManualExecuteResult> {
  const response = await api.ops['scheduled-jobs'][':taskKey'].runs.$post({
    param: { taskKey },
  })

  if (response.status === 409) {
    return scheduledJobManualExecuteResultSchema.parse(await response.json())
  }

  return parseApiResponse(response, scheduledJobManualExecuteResultSchema)
}

export async function listScheduledJobRuns(
  taskKey: string,
  query: ScheduledJobRunsListQuery,
): Promise<ScheduledJobRunListResponse> {
  return parseApiResponse(
    await api.ops['scheduled-jobs'][':taskKey'].runs.$get({
      param: { taskKey },
      query: normalizeRequestQuery(query),
    }),
    scheduledJobRunListResponseSchema,
  )
}

export async function getScheduledJobRun(
  taskKey: string,
  runId: string,
): Promise<ScheduledJobRunDetail> {
  return parseApiResponse(
    await api.ops['scheduled-jobs'][':taskKey'].runs[':runId'].$get({
      param: { taskKey, runId },
    }),
    scheduledJobRunDetailSchema,
  )
}

export async function cancelScheduledJob(
  taskKey: string,
  runId: string,
): Promise<ScheduledJobCancelResponse> {
  return parseApiResponse(
    await api.ops['scheduled-jobs'][':taskKey'].runs[':runId'].cancel.$post({
      param: { taskKey, runId },
    }),
    scheduledJobCancelResponseSchema,
  )
}
