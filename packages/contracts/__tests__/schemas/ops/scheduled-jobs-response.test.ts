import { describe, expect, it } from 'vitest'
import {
  scheduledJobErrorCategorySchema,
  scheduledJobListItemSchema,
  scheduledJobListResponseSchema,
  scheduledJobManualExecuteOverlapResponseSchema,
  scheduledJobManualExecuteResponseSchema,
  scheduledJobRunDetailSchema,
  scheduledJobRunListResponseSchema,
  scheduledJobRunStatusSchema,
  scheduledJobSkipReasonSchema,
  scheduledJobTriggerSourceSchema,
  scheduledJobCancelResponseSchema,
  scheduledJobCurrentRunSummarySchema,
  scheduledJobLatestRunSummarySchema,
} from '../../../src'
import { expectZodIssue, testUuid } from '../../helpers/schema'

const runningRun = {
  id: testUuid(1),
  taskKey: 'auth-session-cleanup' as const,
  triggerSource: 'manual' as const,
  status: 'running' as const,
  skipReason: null,
  scheduledFor: null,
  executorId: testUuid(2),
  deletedCount: null,
  failedCount: null,
  errorCategory: null,
  errorSummary: null,
  triggeredByUserId: testUuid(3),
  triggeredByUsername: 'ada',
  triggeredByNickname: 'Ada Lovelace',
  triggeredBySessionId: testUuid(4),
  triggerRequestId: testUuid(5),
  cancelRequestedAt: null,
  cancelRequestedByUserId: null,
  cancelRequestedByUsername: null,
  cancelRequestedByNickname: null,
  cancelRequestedBySessionId: null,
  cancelRequestId: null,
  startedAt: '2026-08-25T00:00:00.000Z',
  finishedAt: null,
  durationMs: null,
  createdAt: '2026-08-25T00:00:00.000Z',
  updatedAt: '2026-08-25T00:00:00.000Z',
}

const successfulScheduledRun = {
  ...runningRun,
  triggerSource: 'scheduled' as const,
  status: 'success' as const,
  scheduledFor: '2026-08-25T00:00:00.000Z',
  executorId: testUuid(6),
  deletedCount: 4,
  failedCount: 0,
  triggeredByUserId: null,
  triggeredByUsername: null,
  triggeredByNickname: null,
  triggeredBySessionId: null,
  triggerRequestId: null,
  startedAt: '2026-08-25T00:00:01.000Z',
  finishedAt: '2026-08-25T00:00:02.000Z',
  durationMs: 1000,
  updatedAt: '2026-08-25T00:00:02.000Z',
}

const taskItem = {
  taskKey: 'auth-session-cleanup' as const,
  name: '认证会话清理',
  description: '清理过期认证会话',
  cronExpression: '2 */6 * * *',
  timezone: 'Asia/Shanghai',
  enabled: true,
  nextRunAt: '2026-08-25T06:00:02.000Z',
  currentRun: {
    id: runningRun.id,
    triggerSource: runningRun.triggerSource,
    status: runningRun.status,
    scheduledFor: runningRun.scheduledFor,
    startedAt: runningRun.startedAt,
    finishedAt: runningRun.finishedAt,
    durationMs: runningRun.durationMs,
    cancelRequestedAt: runningRun.cancelRequestedAt,
  },
  lastRun: {
    id: successfulScheduledRun.id,
    triggerSource: successfulScheduledRun.triggerSource,
    status: successfulScheduledRun.status,
    scheduledFor: successfulScheduledRun.scheduledFor,
    startedAt: successfulScheduledRun.startedAt,
    finishedAt: successfulScheduledRun.finishedAt,
    durationMs: successfulScheduledRun.durationMs,
    cancelRequestedAt: successfulScheduledRun.cancelRequestedAt,
  },
}

const successfulRunListItem = {
  id: successfulScheduledRun.id,
  taskKey: successfulScheduledRun.taskKey,
  triggerSource: successfulScheduledRun.triggerSource,
  status: successfulScheduledRun.status,
  skipReason: successfulScheduledRun.skipReason,
  scheduledFor: successfulScheduledRun.scheduledFor,
  executorId: successfulScheduledRun.executorId,
  deletedCount: successfulScheduledRun.deletedCount,
  failedCount: successfulScheduledRun.failedCount,
  errorCategory: successfulScheduledRun.errorCategory,
  errorSummary: successfulScheduledRun.errorSummary,
  startedAt: successfulScheduledRun.startedAt,
  finishedAt: successfulScheduledRun.finishedAt,
  durationMs: successfulScheduledRun.durationMs,
  createdAt: successfulScheduledRun.createdAt,
  updatedAt: successfulScheduledRun.updatedAt,
}

describe('scheduled job response schemas', () => {
  it('accepts every fixed enum and rejects unsupported values', () => {
    expect(scheduledJobTriggerSourceSchema.parse('scheduled')).toBe('scheduled')
    expect(scheduledJobTriggerSourceSchema.parse('manual')).toBe('manual')
    expect(scheduledJobTriggerSourceSchema.parse('recovery')).toBe('recovery')
    expect(scheduledJobRunStatusSchema.parse('interrupted')).toBe('interrupted')
    expect(scheduledJobSkipReasonSchema.parse('overlap')).toBe('overlap')
    expect(scheduledJobErrorCategorySchema.parse('partial_failure')).toBe('partial_failure')
    expect(scheduledJobErrorCategorySchema.parse('database')).toBe('database')
    expect(scheduledJobErrorCategorySchema.parse('storage')).toBe('storage')
    expect(scheduledJobErrorCategorySchema.parse('internal')).toBe('internal')

    expectZodIssue(scheduledJobTriggerSourceSchema.safeParse('timer'), {
      message: '定时任务触发来源无效',
    })
    expectZodIssue(scheduledJobRunStatusSchema.safeParse('queued'), {
      message: '定时任务运行状态无效',
    })
    expectZodIssue(scheduledJobSkipReasonSchema.safeParse('capacity'), {
      message: '定时任务跳过原因无效',
    })
    expectZodIssue(scheduledJobErrorCategorySchema.safeParse('secret'), {
      message: '定时任务错误分类无效',
    })
  })

  it('accepts task list items and the non-paginated fixed task list', () => {
    expect(scheduledJobListItemSchema.parse(taskItem)).toEqual(taskItem)
    expect(scheduledJobListResponseSchema.parse([taskItem])).toEqual([taskItem])
    expectZodIssue(scheduledJobListItemSchema.safeParse({ ...taskItem, unknown: true }), {
      message: 'Unrecognized key: "unknown"',
    })
  })

  it('restricts current and latest summaries to their respective status classes', () => {
    expectZodIssue(
      scheduledJobCurrentRunSummarySchema.safeParse({ ...taskItem.currentRun, status: 'success' }),
      { message: '当前运行摘要必须是 running 状态', path: ['status'] },
    )
    expectZodIssue(
      scheduledJobLatestRunSummarySchema.safeParse({ ...taskItem.lastRun, status: 'running' }),
      { message: '最近终态摘要不能是 running 状态', path: ['status'] },
    )
  })

  it('accepts secure run detail and paginated run responses', () => {
    expect(scheduledJobRunDetailSchema.parse(runningRun)).toEqual(runningRun)
    expect(
      scheduledJobRunListResponseSchema.parse({
        list: [successfulRunListItem],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
    ).toEqual({ list: [successfulRunListItem], total: 1, page: 1, pageSize: 20 })
    expectZodIssue(scheduledJobRunDetailSchema.safeParse({ ...runningRun, rawError: 'secret' }), {
      message: 'Unrecognized key: "rawError"',
    })
  })

  it('validates command responses and numeric bounds', () => {
    expect(scheduledJobCancelResponseSchema.parse({ run: taskItem.currentRun })).toEqual({
      run: taskItem.currentRun,
    })
    expect(scheduledJobManualExecuteResponseSchema.parse({ runId: testUuid(7) })).toEqual({
      runId: testUuid(7),
    })
    expect(
      scheduledJobManualExecuteOverlapResponseSchema.parse({
        skippedRunId: testUuid(8),
        activeRunId: testUuid(9),
      }),
    ).toEqual({ skippedRunId: testUuid(8), activeRunId: testUuid(9) })

    expectZodIssue(
      scheduledJobRunDetailSchema.safeParse({ ...successfulScheduledRun, deletedCount: -1 }),
      { message: '任务计数不能小于 0', path: ['deletedCount'] },
    )
    expectZodIssue(
      scheduledJobRunDetailSchema.safeParse({
        ...successfulScheduledRun,
        durationMs: Number.MAX_SAFE_INTEGER + 1,
      }),
      { message: '任务耗时超过安全整数范围', path: ['durationMs'] },
    )
  })

  it('accepts only the wrapped current-run summary for cancellation responses', () => {
    expect(scheduledJobCancelResponseSchema.safeParse(taskItem.currentRun).success).toBe(false)
  })
})
