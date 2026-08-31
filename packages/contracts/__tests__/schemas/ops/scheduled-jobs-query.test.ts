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

  it('accepts well-formed task keys without constraining the server registry', () => {
    for (const taskKey of ['auth-session-cleanup', 'arbitrary-handler', 'unknown']) {
      expect(scheduledJobTaskKeySchema.parse(taskKey)).toBe(taskKey)
      expect(scheduledJobPathSchema.parse({ taskKey })).toEqual({ taskKey })
    }

    expect(scheduledJobRunPathSchema.parse({ taskKey: 'unknown', runId: testUuid(1) })).toEqual({
      taskKey: 'unknown',
      runId: testUuid(1),
    })
  })

  it('rejects blank, oversized, and malformed task keys', () => {
    expectZodIssue(scheduledJobPathSchema.safeParse({ taskKey: ' ' }), {
      message: '定时任务键不能为空',
      path: ['taskKey'],
    })
    expectZodIssue(scheduledJobTaskKeySchema.safeParse('task_key'), {
      message: '定时任务键格式无效',
    })
    expectZodIssue(scheduledJobTaskKeySchema.safeParse('a'.repeat(129)), {
      message: '定时任务键不能超过 128 个字符',
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
