import { z } from 'zod'
import { nonBlankString, paginationQuerySchema } from '../common'

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

export const scheduledJobTaskKeySchema = nonBlankString('定时任务键不能为空')
  .max(128, '定时任务键不能超过 128 个字符')
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, '定时任务键格式无效')

export const scheduledJobTriggerSourceSchema = z.enum(
  [
    SCHEDULED_JOB_TRIGGER_SOURCE_SCHEDULED,
    SCHEDULED_JOB_TRIGGER_SOURCE_MANUAL,
    SCHEDULED_JOB_TRIGGER_SOURCE_RECOVERY,
  ],
  '定时任务触发来源无效',
)

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

export const scheduledJobErrorCategorySchema = z.enum(
  [
    SCHEDULED_JOB_ERROR_CATEGORY_PARTIAL_FAILURE,
    SCHEDULED_JOB_ERROR_CATEGORY_DATABASE,
    SCHEDULED_JOB_ERROR_CATEGORY_STORAGE,
    SCHEDULED_JOB_ERROR_CATEGORY_INTERNAL,
  ],
  '定时任务错误分类无效',
)

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

export const scheduledJobRunsListQuerySchema = paginationQuerySchema.strict()

export const scheduledJobPlanUpdateInputSchema = z
  .object({
    cronExpression: scheduledJobCronExpressionSchema,
    timezone: scheduledJobTimezoneSchema,
  })
  .strict()

export const scheduledJobEnabledInputSchema = z
  .object({
    enabled: z.boolean('启用状态必须是布尔值'),
  })
  .strict()

export const scheduledJobManualExecuteInputSchema = z.object({}).strict().default({})
export const scheduledJobCancelInputSchema = z.object({}).strict().default({})

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

const scheduledJobCurrentRunSummaryFields = {
  ...scheduledJobRunSummaryFields,
  status: z.literal(SCHEDULED_JOB_RUN_STATUS_RUNNING, '当前运行摘要必须是 running 状态'),
  startedAt: scheduledJobDateTimeSchema,
  finishedAt: z.null(),
  durationMs: z.null(),
}
const scheduledJobLatestRunSummaryFields = {
  ...scheduledJobRunSummaryFields,
  status: z.enum(
    [
      SCHEDULED_JOB_RUN_STATUS_SUCCESS,
      SCHEDULED_JOB_RUN_STATUS_FAILURE,
      SCHEDULED_JOB_RUN_STATUS_SKIPPED,
      SCHEDULED_JOB_RUN_STATUS_CANCELLED,
      SCHEDULED_JOB_RUN_STATUS_INTERRUPTED,
    ],
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

export const scheduledJobSchema = z.object(scheduledJobFields).strict()

export const scheduledJobListItemSchema = z
  .object({
    ...scheduledJobFields,
    currentRun: scheduledJobCurrentRunSummarySchema.nullable(),
    lastRun: scheduledJobLatestRunSummarySchema.nullable(),
  })
  .strict()

export const scheduledJobListResponseSchema = z.array(scheduledJobListItemSchema)

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

export const scheduledJobRunDetailSchema = scheduledJobRunRecordBaseSchema

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

export const scheduledJobRunListResponseSchema = z
  .object({
    list: z.array(scheduledJobRunListItemSchema),
    total: z.number().int().min(0),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
  })
  .strict()

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

export const scheduledJobManualExecuteResultSchema = z.union([
  scheduledJobManualExecuteResponseSchema,
  scheduledJobManualExecuteOverlapResponseSchema,
])

export const scheduledJobCancelResponseSchema = z
  .object({
    run: scheduledJobCurrentRunSummarySchema,
  })
  .strict()

export type ScheduledJobTaskKey = z.infer<typeof scheduledJobTaskKeySchema>
export type ScheduledJobTriggerSource = z.infer<typeof scheduledJobTriggerSourceSchema>
export type ScheduledJobRunStatus = z.infer<typeof scheduledJobRunStatusSchema>
export type ScheduledJobSkipReason = z.infer<typeof scheduledJobSkipReasonSchema>
export type ScheduledJobErrorCategory = z.infer<typeof scheduledJobErrorCategorySchema>
export type ScheduledJobPath = z.infer<typeof scheduledJobPathSchema>
export type ScheduledJobRunPath = z.infer<typeof scheduledJobRunPathSchema>
export type ScheduledJobRunsListQuery = z.infer<typeof scheduledJobRunsListQuerySchema>
export type ScheduledJobPlanUpdateInput = z.infer<typeof scheduledJobPlanUpdateInputSchema>
export type ScheduledJobEnabledInput = z.infer<typeof scheduledJobEnabledInputSchema>
export type ScheduledJobManualExecuteInput = z.infer<typeof scheduledJobManualExecuteInputSchema>
export type ScheduledJobCancelInput = z.infer<typeof scheduledJobCancelInputSchema>
export type ScheduledJobCurrentRunSummary = z.infer<typeof scheduledJobCurrentRunSummarySchema>
export type ScheduledJobLatestRunSummary = z.infer<typeof scheduledJobLatestRunSummarySchema>
export type ScheduledJob = z.infer<typeof scheduledJobSchema>
export type ScheduledJobListItem = z.infer<typeof scheduledJobListItemSchema>
export type ScheduledJobListResponse = z.infer<typeof scheduledJobListResponseSchema>
export type ScheduledJobRunDetail = z.infer<typeof scheduledJobRunDetailSchema>
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
