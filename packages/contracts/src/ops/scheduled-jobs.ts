import { z } from 'zod'
import { nonBlankString, paginationQuerySchema } from '../common'

export const SCHEDULED_JOB_TASK_KEY_AUTH_SESSION_CLEANUP = 'auth-session-cleanup'
export const SCHEDULED_JOB_TASK_KEY_AUTH_LOGIN_ATTEMPT_CLEANUP = 'auth-login-attempt-cleanup'
export const SCHEDULED_JOB_TASK_KEY_OPS_LOGIN_LOG_CLEANUP = 'ops-login-log-cleanup'
export const SCHEDULED_JOB_TASK_KEY_OPS_OPERATION_LOG_CLEANUP = 'ops-operation-log-cleanup'
export const SCHEDULED_JOB_TASK_KEY_ATTACHMENT_EXPIRED_UPLOAD_SESSION_CLEANUP =
  'attachment-expired-upload-session-cleanup'
export const SCHEDULED_JOB_TASK_KEY_ATTACHMENT_UNREFERENCED_CLEANUP =
  'attachment-unreferenced-cleanup'
export const SCHEDULED_JOB_TASK_KEY_ATTACHMENT_ORPHANED_STORAGE_CLEANUP =
  'attachment-orphaned-storage-cleanup'
export const SCHEDULED_JOB_TASK_KEY_OPS_JOB_RUN_CLEANUP = 'ops-job-run-cleanup'

export const SCHEDULED_JOB_TRIGGER_SOURCE_SCHEDULED = 'scheduled'
export const SCHEDULED_JOB_TRIGGER_SOURCE_MANUAL = 'manual'
export const SCHEDULED_JOB_TRIGGER_SOURCE_RECOVERY = 'recovery'

export const SCHEDULED_JOB_RUN_STATUS_RUNNING = 'running'
export const SCHEDULED_JOB_RUN_STATUS_SUCCESS = 'success'
export const SCHEDULED_JOB_RUN_STATUS_FAILURE = 'failure'
export const SCHEDULED_JOB_RUN_STATUS_SKIPPED = 'skipped'
export const SCHEDULED_JOB_RUN_STATUS_CANCELLED = 'cancelled'
export const SCHEDULED_JOB_RUN_STATUS_INTERRUPTED = 'interrupted'

export const SCHEDULED_JOB_SKIP_REASON_OVERLAP = 'overlap'

export const SCHEDULED_JOB_ERROR_CATEGORY_PARTIAL_FAILURE = 'partial_failure'
export const SCHEDULED_JOB_ERROR_CATEGORY_DATABASE = 'database'
export const SCHEDULED_JOB_ERROR_CATEGORY_STORAGE = 'storage'
export const SCHEDULED_JOB_ERROR_CATEGORY_INTERNAL = 'internal'

export const scheduledJobTaskKeySchema = z.enum(
  [
    SCHEDULED_JOB_TASK_KEY_AUTH_SESSION_CLEANUP,
    SCHEDULED_JOB_TASK_KEY_AUTH_LOGIN_ATTEMPT_CLEANUP,
    SCHEDULED_JOB_TASK_KEY_OPS_LOGIN_LOG_CLEANUP,
    SCHEDULED_JOB_TASK_KEY_OPS_OPERATION_LOG_CLEANUP,
    SCHEDULED_JOB_TASK_KEY_ATTACHMENT_EXPIRED_UPLOAD_SESSION_CLEANUP,
    SCHEDULED_JOB_TASK_KEY_ATTACHMENT_UNREFERENCED_CLEANUP,
    SCHEDULED_JOB_TASK_KEY_ATTACHMENT_ORPHANED_STORAGE_CLEANUP,
    SCHEDULED_JOB_TASK_KEY_OPS_JOB_RUN_CLEANUP,
  ],
  '定时任务键无效',
)
export const scheduledJobKeySchema = scheduledJobTaskKeySchema

export const scheduledJobTriggerSourceSchema = z.enum(
  [
    SCHEDULED_JOB_TRIGGER_SOURCE_SCHEDULED,
    SCHEDULED_JOB_TRIGGER_SOURCE_MANUAL,
    SCHEDULED_JOB_TRIGGER_SOURCE_RECOVERY,
  ],
  '定时任务触发来源无效',
)
export const scheduledJobTriggerSchema = scheduledJobTriggerSourceSchema

export const scheduledJobRunStatusSchema = z.enum(
  [
    SCHEDULED_JOB_RUN_STATUS_RUNNING,
    SCHEDULED_JOB_RUN_STATUS_SUCCESS,
    SCHEDULED_JOB_RUN_STATUS_FAILURE,
    SCHEDULED_JOB_RUN_STATUS_SKIPPED,
    SCHEDULED_JOB_RUN_STATUS_CANCELLED,
    SCHEDULED_JOB_RUN_STATUS_INTERRUPTED,
  ],
  '定时任务运行状态无效',
)

export const scheduledJobSkipReasonSchema = z.enum(
  [SCHEDULED_JOB_SKIP_REASON_OVERLAP],
  '定时任务跳过原因无效',
)
export const scheduledJobSkipSchema = scheduledJobSkipReasonSchema

export const scheduledJobErrorCategorySchema = z.enum(
  [
    SCHEDULED_JOB_ERROR_CATEGORY_PARTIAL_FAILURE,
    SCHEDULED_JOB_ERROR_CATEGORY_DATABASE,
    SCHEDULED_JOB_ERROR_CATEGORY_STORAGE,
    SCHEDULED_JOB_ERROR_CATEGORY_INTERNAL,
  ],
  '定时任务错误分类无效',
)
export const scheduledJobErrorSchema = scheduledJobErrorCategorySchema

export const scheduledJobRunTriggerSourceSchema = scheduledJobTriggerSourceSchema
export const scheduledJobStatusSchema = scheduledJobRunStatusSchema

const scheduledJobTaskNameSchema = nonBlankString('定时任务名称不能为空').max(
  128,
  '定时任务名称不能超过 128 个字符',
)
const scheduledJobDescriptionSchema = nonBlankString('定时任务说明不能为空').max(
  512,
  '定时任务说明不能超过 512 个字符',
)
const scheduledJobCronExpressionSchema = z
  .string('Cron 表达式不能为空')
  .trim()
  .min(1, 'Cron 表达式不能为空')
  .max(128, 'Cron 表达式不能超过 128 个字符')
const scheduledJobTimezoneSchema = z
  .string('时区不能为空')
  .trim()
  .min(1, '时区不能为空')
  .max(128, '时区不能超过 128 个字符')
const scheduledJobDateTimeSchema = z.iso.datetime()
const scheduledJobNullableDateTimeSchema = scheduledJobDateTimeSchema.nullable()
const scheduledJobIdSchema = z.uuid('任务运行 ID 无效')
const scheduledJobExecutorIdSchema = z.uuid('执行器 ID 无效')
const scheduledJobUserIdSchema = z.uuid('用户 ID 无效')
const scheduledJobSessionIdSchema = z.uuid('会话 ID 无效')
const scheduledJobRequestIdSchema = z.uuid('请求 ID 无效')
const scheduledJobSnapshotStringSchema = nonBlankString('快照字段不能为空').max(
  512,
  '快照字段不能超过 512 个字符',
)
const scheduledJobCountSchema = z
  .number('任务计数必须是数字')
  .int('任务计数必须是整数')
  .min(0, '任务计数不能小于 0')
  .max(Number.MAX_SAFE_INTEGER, '任务计数超过安全整数范围')
const scheduledJobNullableCountSchema = scheduledJobCountSchema.nullable()
const scheduledJobDurationSchema = z
  .number('任务耗时必须是数字')
  .int('任务耗时必须是整数')
  .min(0, '任务耗时不能小于 0')
  .max(Number.MAX_SAFE_INTEGER, '任务耗时超过安全整数范围')
const scheduledJobNullableDurationSchema = scheduledJobDurationSchema.nullable()

export const scheduledJobPathSchema = z
  .object({
    taskKey: scheduledJobTaskKeySchema,
  })
  .strict()

export const scheduledJobRunPathSchema = z
  .object({
    taskKey: scheduledJobTaskKeySchema,
    runId: scheduledJobIdSchema,
  })
  .strict()
export const scheduledJobRunDetailPathSchema = scheduledJobRunPathSchema

export const scheduledJobRunsListQuerySchema = paginationQuerySchema.strict()
export const scheduledJobRunListQuerySchema = scheduledJobRunsListQuerySchema

export const scheduledJobPlanUpdateInputSchema = z
  .object({
    cronExpression: scheduledJobCronExpressionSchema,
    timezone: scheduledJobTimezoneSchema,
  })
  .strict()

export const scheduledJobUpdateInputSchema = scheduledJobPlanUpdateInputSchema
export const scheduledJobUpdatePlanInputSchema = scheduledJobPlanUpdateInputSchema

export const scheduledJobEnabledInputSchema = z
  .object({
    enabled: z.boolean('启用状态必须是布尔值'),
  })
  .strict()

export const scheduledJobEnableInputSchema = scheduledJobEnabledInputSchema

export const scheduledJobManualExecuteInputSchema = z.object({}).strict().default({})
export const scheduledJobCancelInputSchema = z.object({}).strict().default({})
export const scheduledJobManualRunInputSchema = scheduledJobManualExecuteInputSchema
export const scheduledJobRunCancelInputSchema = scheduledJobCancelInputSchema

const scheduledJobRunSummaryFields = {
  id: scheduledJobIdSchema,
  triggerSource: scheduledJobTriggerSourceSchema,
  status: scheduledJobRunStatusSchema,
  scheduledFor: scheduledJobNullableDateTimeSchema,
  startedAt: scheduledJobNullableDateTimeSchema,
  finishedAt: scheduledJobNullableDateTimeSchema,
  durationMs: scheduledJobNullableDurationSchema,
  cancelRequestedAt: scheduledJobNullableDateTimeSchema,
}

export const scheduledJobRunSummarySchema = z.object(scheduledJobRunSummaryFields).strict()

const scheduledJobCurrentRunSummaryFields = {
  ...scheduledJobRunSummaryFields,
  status: z.literal('running', '当前运行摘要必须是 running 状态'),
  startedAt: scheduledJobDateTimeSchema,
  finishedAt: z.null(),
  durationMs: z.null(),
}
const scheduledJobLatestRunSummaryFields = {
  ...scheduledJobRunSummaryFields,
  status: z.enum(
    ['success', 'failure', 'skipped', 'cancelled', 'interrupted'],
    '最近终态摘要不能是 running 状态',
  ),
  finishedAt: scheduledJobDateTimeSchema,
}

export const scheduledJobCurrentRunSummarySchema = z
  .object(scheduledJobCurrentRunSummaryFields)
  .strict()
export const scheduledJobLatestRunSummarySchema = z
  .object(scheduledJobLatestRunSummaryFields)
  .strict()

const scheduledJobFields = {
  taskKey: scheduledJobTaskKeySchema,
  name: scheduledJobTaskNameSchema,
  description: scheduledJobDescriptionSchema,
  cronExpression: scheduledJobCronExpressionSchema,
  timezone: scheduledJobTimezoneSchema,
  enabled: z.boolean(),
  nextRunAt: scheduledJobNullableDateTimeSchema,
}

function validateScheduledJobPlan(
  value: { enabled: boolean; nextRunAt: string | null },
  context: z.RefinementCtx,
) {
  if (value.enabled && value.nextRunAt === null) {
    addIssue(context, '启用任务必须有下次执行时间', ['nextRunAt'])
  }
  if (!value.enabled && value.nextRunAt !== null) {
    addIssue(context, '禁用任务不能有下次执行时间', ['nextRunAt'])
  }
}

export const scheduledJobSchema = z
  .object(scheduledJobFields)
  .strict()
  .superRefine(validateScheduledJobPlan)

export const scheduledJobListItemSchema = z
  .object({
    ...scheduledJobFields,
    currentRun: scheduledJobCurrentRunSummarySchema.nullable(),
    lastRun: scheduledJobLatestRunSummarySchema.nullable(),
  })
  .strict()
  .superRefine(validateScheduledJobPlan)

export const scheduledJobListResponseSchema = z.array(scheduledJobListItemSchema)
export const scheduledJobUpdateResponseSchema = scheduledJobListItemSchema
export const scheduledJobEnabledResponseSchema = scheduledJobListItemSchema

const scheduledJobRunRecordBaseSchema = z
  .object({
    id: scheduledJobIdSchema,
    taskKey: scheduledJobTaskKeySchema,
    triggerSource: scheduledJobTriggerSourceSchema,
    status: scheduledJobRunStatusSchema,
    skipReason: scheduledJobSkipReasonSchema.nullable(),
    scheduledFor: scheduledJobNullableDateTimeSchema,
    executorId: scheduledJobExecutorIdSchema.nullable(),
    deletedCount: scheduledJobNullableCountSchema,
    failedCount: scheduledJobNullableCountSchema,
    errorCategory: scheduledJobErrorCategorySchema.nullable(),
    errorSummary: scheduledJobSnapshotStringSchema.nullable(),
    triggeredByUserId: scheduledJobUserIdSchema.nullable(),
    triggeredByUsername: scheduledJobSnapshotStringSchema.nullable(),
    triggeredByNickname: scheduledJobSnapshotStringSchema.nullable(),
    triggeredBySessionId: scheduledJobSessionIdSchema.nullable(),
    triggerRequestId: scheduledJobRequestIdSchema.nullable(),
    cancelRequestedAt: scheduledJobNullableDateTimeSchema,
    cancelRequestedByUserId: scheduledJobUserIdSchema.nullable(),
    cancelRequestedByUsername: scheduledJobSnapshotStringSchema.nullable(),
    cancelRequestedByNickname: scheduledJobSnapshotStringSchema.nullable(),
    cancelRequestedBySessionId: scheduledJobSessionIdSchema.nullable(),
    cancelRequestId: scheduledJobRequestIdSchema.nullable(),
    startedAt: scheduledJobNullableDateTimeSchema,
    finishedAt: scheduledJobNullableDateTimeSchema,
    durationMs: scheduledJobNullableDurationSchema,
    createdAt: scheduledJobDateTimeSchema,
    updatedAt: scheduledJobDateTimeSchema,
  })
  .strict()

type ScheduledJobRunRecord = z.infer<typeof scheduledJobRunRecordBaseSchema>
type ScheduledJobPublicRunRecord = Pick<
  ScheduledJobRunRecord,
  | 'status'
  | 'skipReason'
  | 'executorId'
  | 'deletedCount'
  | 'failedCount'
  | 'errorCategory'
  | 'errorSummary'
  | 'startedAt'
  | 'finishedAt'
  | 'durationMs'
>

const triggerActorFields: Array<keyof ScheduledJobRunRecord> = [
  'triggeredByUserId',
  'triggeredByUsername',
  'triggeredByNickname',
  'triggeredBySessionId',
  'triggerRequestId',
]

const cancellationSnapshotFields: Array<keyof ScheduledJobRunRecord> = [
  'cancelRequestedAt',
  'cancelRequestedByUserId',
  'cancelRequestedByUsername',
  'cancelRequestedByNickname',
  'cancelRequestedBySessionId',
  'cancelRequestId',
]

function addIssue(context: z.RefinementCtx, message: string, path: (string | number)[]) {
  context.addIssue({ code: 'custom', message, path })
}

function validatePublicRunRecord(value: ScheduledJobPublicRunRecord, context: z.RefinementCtx) {
  const skipped = value.status === 'skipped'
  const running = value.status === 'running'
  const interrupted = value.status === 'interrupted'
  const hasFinishedAt = value.finishedAt !== null
  const hasStartedAt = value.startedAt !== null
  const hasExecutorId = value.executorId !== null
  const hasDuration = value.durationMs !== null

  if (running && hasFinishedAt) {
    addIssue(context, '运行中的任务不能有结束时间', ['finishedAt'])
  }
  if (!running && !hasFinishedAt) {
    addIssue(context, '终态任务必须有结束时间', ['finishedAt'])
  }

  if (skipped) {
    if (value.skipReason !== 'overlap') {
      addIssue(context, '跳过运行必须使用 overlap 原因', ['skipReason'])
    }
    if (hasStartedAt) addIssue(context, '跳过运行不能有开始时间', ['startedAt'])
    if (hasExecutorId) addIssue(context, '跳过运行不能有执行器', ['executorId'])
    if (value.deletedCount !== null) addIssue(context, '跳过运行不能有删除计数', ['deletedCount'])
    if (value.failedCount !== null) addIssue(context, '跳过运行不能有失败计数', ['failedCount'])
    if (value.errorCategory !== null) addIssue(context, '跳过运行不能有错误分类', ['errorCategory'])
    if (value.errorSummary !== null) addIssue(context, '跳过运行不能有错误摘要', ['errorSummary'])
  } else {
    if (value.skipReason !== null) {
      addIssue(context, '非跳过运行不能有跳过原因', ['skipReason'])
    }
    if (!hasStartedAt) addIssue(context, '实际运行必须有开始时间', ['startedAt'])
    if (!hasExecutorId) addIssue(context, '实际运行必须有执行器', ['executorId'])
  }

  if (running || skipped || interrupted) {
    if (hasDuration) addIssue(context, '当前状态不能有耗时', ['durationMs'])
  } else if (!hasDuration) {
    addIssue(context, '终态运行必须有耗时', ['durationMs'])
  }

  if (running) {
    if (value.deletedCount !== null)
      addIssue(context, '运行中的任务不能有删除计数', ['deletedCount'])
    if (value.failedCount !== null) addIssue(context, '运行中的任务不能有失败计数', ['failedCount'])
    if (value.errorCategory !== null)
      addIssue(context, '运行中的任务不能有错误分类', ['errorCategory'])
    if (value.errorSummary !== null)
      addIssue(context, '运行中的任务不能有错误摘要', ['errorSummary'])
  }

  if (interrupted) {
    if (value.deletedCount !== null) addIssue(context, '中断运行不能有删除计数', ['deletedCount'])
    if (value.failedCount !== null) addIssue(context, '中断运行不能有失败计数', ['failedCount'])
    if (value.errorCategory !== null) addIssue(context, '中断运行不能有错误分类', ['errorCategory'])
    if (value.errorSummary !== null) addIssue(context, '中断运行不能有错误摘要', ['errorSummary'])
  }

  if (value.status === 'success') {
    if (value.deletedCount === null) {
      addIssue(context, '成功运行必须有删除计数', ['deletedCount'])
    }
    if (value.failedCount !== 0) {
      addIssue(context, '成功运行的失败计数必须为 0', ['failedCount'])
    }
    if (value.errorCategory !== null) {
      addIssue(context, '成功运行不能有错误分类', ['errorCategory'])
    }
    if (value.errorSummary !== null) {
      addIssue(context, '成功运行不能有错误摘要', ['errorSummary'])
    }
  }

  if (value.status === 'failure') {
    if (value.errorCategory === null) {
      addIssue(context, '失败运行必须有错误分类', ['errorCategory'])
    }
    if (value.errorSummary === null) {
      addIssue(context, '失败运行必须有错误摘要', ['errorSummary'])
    }
  }

  if (value.status !== 'failure' && value.status !== 'running' && value.status !== 'skipped') {
    if (value.errorCategory !== null) {
      addIssue(context, '当前状态不能有错误分类', ['errorCategory'])
    }
    if (value.errorSummary !== null) {
      addIssue(context, '当前状态不能有错误摘要', ['errorSummary'])
    }
  }
}

function validateRunRecord(value: ScheduledJobRunRecord, context: z.RefinementCtx) {
  validatePublicRunRecord(value, context)

  const manual = value.triggerSource === 'manual'
  if (manual) {
    for (const field of triggerActorFields) {
      if (value[field] === null) {
        addIssue(context, '手动运行必须包含完整操作者快照', [field])
      }
    }
  } else {
    for (const field of triggerActorFields) {
      if (value[field] !== null) {
        addIssue(context, '非手动运行不能包含操作者快照', [field])
      }
    }
  }

  if (value.triggerSource === 'scheduled' && value.scheduledFor === null) {
    addIssue(context, '定时运行必须有计划时间', ['scheduledFor'])
  }
  if (manual && value.scheduledFor !== null) {
    addIssue(context, '手动运行不能有计划时间', ['scheduledFor'])
  }

  const cancellationValues = cancellationSnapshotFields.map((field) => value[field])
  const hasCancellation = cancellationValues.some((fieldValue) => fieldValue !== null)
  const completeCancellation = cancellationValues.every((fieldValue) => fieldValue !== null)
  if (hasCancellation && !completeCancellation) {
    for (const field of cancellationSnapshotFields) {
      if (value[field] === null) {
        addIssue(context, '取消请求快照必须完整', [field])
      }
    }
  }
  if (value.status === 'cancelled' && !completeCancellation) {
    addIssue(context, '已取消运行必须包含完整取消请求快照', ['cancelRequestedAt'])
  }
  if (
    hasCancellation &&
    value.status !== 'running' &&
    value.status !== 'cancelled' &&
    value.status !== 'interrupted'
  ) {
    addIssue(context, '当前状态不能有取消请求快照', ['cancelRequestedAt'])
  }
}

export const scheduledJobRunDetailSchema =
  scheduledJobRunRecordBaseSchema.superRefine(validateRunRecord)
export const scheduledJobRunSchema = scheduledJobRunDetailSchema

export const scheduledJobRunListItemSchema = scheduledJobRunRecordBaseSchema
  .omit({
    triggeredByUserId: true,
    triggeredByUsername: true,
    triggeredByNickname: true,
    triggeredBySessionId: true,
    triggerRequestId: true,
    cancelRequestedAt: true,
    cancelRequestedByUserId: true,
    cancelRequestedByUsername: true,
    cancelRequestedByNickname: true,
    cancelRequestedBySessionId: true,
    cancelRequestId: true,
  })
  .strict()
  .superRefine(validatePublicRunRecord)

export const scheduledJobRunListResponseSchema = z
  .object({
    list: z.array(scheduledJobRunListItemSchema),
    total: z.number().int().min(0),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
  })
  .strict()
export const scheduledJobRunsListResponseSchema = scheduledJobRunListResponseSchema

export const scheduledJobManualExecuteResponseSchema = z
  .object({
    runId: scheduledJobIdSchema,
  })
  .strict()

export const scheduledJobManualExecuteOverlapResponseSchema = z
  .object({
    skippedRunId: scheduledJobIdSchema,
    activeRunId: scheduledJobIdSchema,
  })
  .strict()

export const scheduledJobManualExecuteConflictResponseSchema =
  scheduledJobManualExecuteOverlapResponseSchema
export const scheduledJobManualRunResponseSchema = scheduledJobManualExecuteResponseSchema
export const scheduledJobManualRunOverlapResponseSchema =
  scheduledJobManualExecuteOverlapResponseSchema
export const scheduledJobManualExecuteResultSchema = z.union([
  scheduledJobManualExecuteResponseSchema,
  scheduledJobManualExecuteOverlapResponseSchema,
])

const scheduledJobCancelResponseWithRunSchema = z
  .object({
    run: scheduledJobCurrentRunSummarySchema,
  })
  .strict()
export const scheduledJobCancelResponseSchema = scheduledJobCancelResponseWithRunSchema
export const scheduledJobRunCancelResponseSchema = scheduledJobCancelResponseSchema

export type ScheduledJobTaskKey = z.infer<typeof scheduledJobTaskKeySchema>
export type ScheduledJobKey = ScheduledJobTaskKey
export type ScheduledJobTriggerSource = z.infer<typeof scheduledJobTriggerSourceSchema>
export type ScheduledJobTrigger = ScheduledJobTriggerSource
export type ScheduledJobRunStatus = z.infer<typeof scheduledJobRunStatusSchema>
export type ScheduledJobSkipReason = z.infer<typeof scheduledJobSkipReasonSchema>
export type ScheduledJobErrorCategory = z.infer<typeof scheduledJobErrorCategorySchema>
export type ScheduledJobPath = z.infer<typeof scheduledJobPathSchema>
export type ScheduledJobRunPath = z.infer<typeof scheduledJobRunPathSchema>
export type ScheduledJobRunsListQuery = z.infer<typeof scheduledJobRunsListQuerySchema>
export type ScheduledJobRunListQuery = ScheduledJobRunsListQuery
export type ScheduledJobPlanUpdateInput = z.infer<typeof scheduledJobPlanUpdateInputSchema>
export type ScheduledJobUpdateInput = ScheduledJobPlanUpdateInput
export type ScheduledJobEnabledInput = z.infer<typeof scheduledJobEnabledInputSchema>
export type ScheduledJobManualExecuteInput = z.infer<typeof scheduledJobManualExecuteInputSchema>
export type ScheduledJobCancelInput = z.infer<typeof scheduledJobCancelInputSchema>
export type ScheduledJobRunSummary = z.infer<typeof scheduledJobRunSummarySchema>
export type ScheduledJob = z.infer<typeof scheduledJobSchema>
export type ScheduledJobListItem = z.infer<typeof scheduledJobListItemSchema>
export type ScheduledJobListResponse = z.infer<typeof scheduledJobListResponseSchema>
export type ScheduledJobRunDetail = z.infer<typeof scheduledJobRunDetailSchema>
export type ScheduledJobRun = ScheduledJobRunDetail
export type ScheduledJobRunListItem = z.infer<typeof scheduledJobRunListItemSchema>
export type ScheduledJobRunListResponse = z.infer<typeof scheduledJobRunListResponseSchema>
export type ScheduledJobManualExecuteResponse = z.infer<
  typeof scheduledJobManualExecuteResponseSchema
>
export type ScheduledJobManualExecuteOverlapResponse = z.infer<
  typeof scheduledJobManualExecuteOverlapResponseSchema
>
export type ScheduledJobManualExecuteResult = z.infer<typeof scheduledJobManualExecuteResultSchema>
export type ScheduledJobCancelResponse = z.infer<typeof scheduledJobCancelResponseSchema>
