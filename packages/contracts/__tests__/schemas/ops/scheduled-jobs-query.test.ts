import { describe, expect, it } from 'vitest'
import {
  scheduledJobPathSchema,
  scheduledJobRunPathSchema,
  scheduledJobRunsListQuerySchema,
  scheduledJobTaskKeySchema,
} from '../../../src'
import { expectZodIssue, testUuid } from '../../helpers/schema'

describe('scheduled job query and path schemas', () => {
  it('parses pagination defaults for the run list and trims nothing beyond pagination', () => {
    expect(scheduledJobRunsListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 })
    expect(scheduledJobRunsListQuerySchema.parse({ page: '2', pageSize: '50' })).toEqual({
      page: 2,
      pageSize: 50,
    })
  })

  it('rejects unknown query and path fields', () => {
    expectZodIssue(scheduledJobRunsListQuerySchema.safeParse({ page: '1', unknown: 'x' }), {
      message: 'Unrecognized key: "unknown"',
    })
    expectZodIssue(
      scheduledJobPathSchema.safeParse({
        taskKey: 'auth-session-cleanup',
        extra: true,
      }),
      { message: 'Unrecognized key: "extra"' },
    )
    expectZodIssue(
      scheduledJobRunPathSchema.safeParse({
        taskKey: 'auth-session-cleanup',
        runId: testUuid(1),
        extra: true,
      }),
      { message: 'Unrecognized key: "extra"' },
    )
  })

  it('accepts fixed and unknown non-blank task keys at the path boundary', () => {
    const taskKeys = [
      'auth-session-cleanup',
      'auth-login-attempt-cleanup',
      'ops-login-log-cleanup',
      'ops-operation-log-cleanup',
      'attachment-expired-upload-session-cleanup',
      'attachment-unreferenced-cleanup',
      'attachment-orphaned-storage-cleanup',
      'ops-job-run-cleanup',
    ] as const

    for (const taskKey of taskKeys) {
      expect(scheduledJobTaskKeySchema.parse(taskKey)).toBe(taskKey)
      expect(scheduledJobPathSchema.parse({ taskKey })).toEqual({ taskKey })
    }

    expect(scheduledJobPathSchema.parse({ taskKey: 'arbitrary-handler' })).toEqual({
      taskKey: 'arbitrary-handler',
    })
    expect(scheduledJobTaskKeySchema.safeParse('arbitrary-handler').success).toBe(false)
    expectZodIssue(scheduledJobPathSchema.safeParse({ taskKey: ' ' }), {
      message: '定时任务键不能为空',
      path: ['taskKey'],
    })
    expectZodIssue(scheduledJobTaskKeySchema.safeParse('arbitrary-handler'), {
      message: '定时任务键无效',
    })
    expect(scheduledJobRunPathSchema.parse({ taskKey: 'unknown', runId: testUuid(1) })).toEqual({
      taskKey: 'unknown',
      runId: testUuid(1),
    })
  })

  it('validates run ids in the run path', () => {
    expect(
      scheduledJobRunPathSchema.parse({ taskKey: 'ops-job-run-cleanup', runId: testUuid(1) }),
    ).toEqual({ taskKey: 'ops-job-run-cleanup', runId: testUuid(1) })
    expectZodIssue(
      scheduledJobRunPathSchema.safeParse({ taskKey: 'ops-job-run-cleanup', runId: 'invalid' }),
      { message: '任务运行 ID 无效', path: ['runId'] },
    )
  })
})
