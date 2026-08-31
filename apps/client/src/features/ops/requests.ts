import {
  type LoginLogListQuery,
  type LoginLogListResponse,
  loginLogListResponseSchema,
  type OnlineSessionListQuery,
  type OnlineSessionListResponse,
  onlineSessionListResponseSchema,
  type OperationLogDetail,
  operationLogDetailSchema,
  type OperationLogListQuery,
  type OperationLogListResponse,
  operationLogListResponseSchema,
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
import {
  ApiRequestError,
  assertApiResponseOk,
  normalizeRequestQuery,
  parseApiError,
  parseApiResponse,
} from '../../utils/request'

export async function listLoginLogs(query: LoginLogListQuery): Promise<LoginLogListResponse> {
  return parseApiResponse(
    await api.ops['login-logs'].$get({ query: normalizeRequestQuery(query) }),
    loginLogListResponseSchema,
  )
}

export async function listOnlineSessions(
  query: OnlineSessionListQuery,
): Promise<OnlineSessionListResponse> {
  return parseApiResponse(
    await api.ops.sessions.$get({ query: normalizeRequestQuery(query) }),
    onlineSessionListResponseSchema,
  )
}

export async function revokeOnlineSession(id: string): Promise<void> {
  await assertApiResponseOk(await api.ops.sessions[':id'].$delete({ param: { id } }))
}

export async function listOperationLogs(
  query: OperationLogListQuery,
): Promise<OperationLogListResponse> {
  return parseApiResponse(
    await api.ops['operation-logs'].$get({ query: normalizeRequestQuery(query) }),
    operationLogListResponseSchema,
  )
}

export async function getOperationLog(id: string): Promise<OperationLogDetail> {
  return parseApiResponse(
    await api.ops['operation-logs'][':id'].$get({ param: { id } }),
    operationLogDetailSchema,
  )
}

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

async function parseScheduledJobCommandResponse<T>(
  response: Response,
  acceptedStatuses: readonly number[],
  schema: Parameters<typeof parseApiResponse<T>>[1],
): Promise<T> {
  if (!acceptedStatuses.includes(response.status)) {
    if (!response.ok) {
      throw await parseApiError(response)
    }

    throw new ApiRequestError(response.status, '请求响应状态无效')
  }

  return schema.parse(await response.json())
}

export async function executeScheduledJob(
  taskKey: string,
): Promise<ScheduledJobManualExecuteResult> {
  return parseScheduledJobCommandResponse(
    await api.ops['scheduled-jobs'][':taskKey'].runs.$post({
      param: { taskKey },
    }),
    [202, 409],
    scheduledJobManualExecuteResultSchema,
  )
}

export async function listScheduledJobRuns(
  taskKey: string,
  query: ScheduledJobRunsListQuery,
  options: { signal?: AbortSignal } = {},
): Promise<ScheduledJobRunListResponse> {
  return parseApiResponse(
    await api.ops['scheduled-jobs'][':taskKey'].runs.$get(
      {
        param: { taskKey },
        query: normalizeRequestQuery(query),
      },
      options.signal === undefined ? undefined : { init: { signal: options.signal } },
    ),
    scheduledJobRunListResponseSchema,
  )
}

export async function getScheduledJobRun(
  taskKey: string,
  runId: string,
  options: { signal?: AbortSignal } = {},
): Promise<ScheduledJobRunDetail> {
  return parseApiResponse(
    await api.ops['scheduled-jobs'][':taskKey'].runs[':runId'].$get(
      { param: { taskKey, runId } },
      options.signal === undefined ? undefined : { init: { signal: options.signal } },
    ),
    scheduledJobRunDetailSchema,
  )
}

export async function cancelScheduledJob(
  taskKey: string,
  runId: string,
): Promise<ScheduledJobCancelResponse> {
  return parseScheduledJobCommandResponse(
    await api.ops['scheduled-jobs'][':taskKey'].runs[':runId'].cancel.$post({
      param: { taskKey, runId },
    }),
    [202],
    scheduledJobCancelResponseSchema,
  )
}
