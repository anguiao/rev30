import { describe, expect, it } from 'vitest'
import {
  systemHealthIssueSchema,
  systemHealthJobStatisticsSchema,
  systemHealthSnapshotSchema,
  systemHealthStatusSchema,
} from '../../../src'
import { expectZodIssue, testUuid } from '../../helpers/schema'

const timestamp = '2026-09-01T02:00:00.000Z'
const counts = { running: 0, success: 0, failure: 0, skipped: 0, cancelled: 0, interrupted: 0 }
const snapshot = {
  observedAt: timestamp,
  status: 'healthy',
  issues: [],
  instance: {
    startedAt: timestamp,
    uptimeSeconds: 0,
    nodeVersion: 'v24.0.0',
    platform: 'linux',
    arch: 'arm64',
    memory: { rssBytes: 1024, heapUsedBytes: 512, heapTotalBytes: 1024, externalBytes: 0 },
  },
  database: { status: 'healthy', latencyMs: 0, checkedAt: timestamp },
  storage: {
    status: 'healthy',
    provider: 'local',
    latencyMs: 1,
    checkedAt: timestamp,
    cached: false,
  },
  scheduler: {
    runtimeStatus: 'running',
    automaticCapacity: 2,
    automaticRunning: 0,
    manualStarting: 0,
    recoveryQueued: 0,
    retryPending: false,
    nextWakeAt: null,
    lastPollAt: null,
    lastPollStatus: null,
    shared: { runningCount: 0, overdueCount: 0, oldestOverdueAt: null },
  },
}
const anomaly = {
  taskKey: 'auth-session-cleanup',
  taskName: '认证会话清理',
  runId: testUuid(1),
  finishedAt: timestamp,
  status: 'failure',
  errorCategory: 'database',
  errorSummary: '数据库操作失败',
}
const statistics = {
  generatedAt: timestamp,
  timezone: 'Asia/Shanghai',
  dailyRuns: Array.from({ length: 7 }, (_, index) => ({
    date: `2026-08-${index + 25}`,
    ...counts,
  })),
  statusDistribution: counts,
  failureCategories: ['partial_failure', 'database', 'storage', 'internal'].map((category) => ({
    category,
    count: 0,
  })),
  averageDurations: [
    { taskKey: anomaly.taskKey, taskName: anomaly.taskName, averageDurationMs: 0, runCount: 1 },
  ],
  recentAnomalies: [anomaly],
}

describe('system health response schemas', () => {
  it('accepts fixed statuses and issues and rejects unknown values', () => {
    for (const status of ['healthy', 'degraded', 'unhealthy'])
      expect(systemHealthStatusSchema.parse(status)).toBe(status)
    for (const issue of [
      'database_unavailable',
      'storage_unavailable',
      'scheduler_stopped',
      'scheduler_query_retry',
      'scheduler_overdue',
    ])
      expect(systemHealthIssueSchema.parse(issue)).toBe(issue)
    expectZodIssue(systemHealthStatusSchema.safeParse('ready'), { message: '系统健康状态无效' })
    expectZodIssue(systemHealthIssueSchema.safeParse('raw_error'), { message: '系统健康问题无效' })
  })

  it('accepts snapshots with nullable unavailable dependencies and scheduler diagnostics', () => {
    expect(systemHealthSnapshotSchema.parse(snapshot)).toEqual(snapshot)
    const unavailable = {
      ...snapshot,
      status: 'unhealthy',
      issues: ['database_unavailable', 'storage_unavailable', 'scheduler_stopped'],
      database: { ...snapshot.database, status: 'unavailable', latencyMs: null },
      storage: { ...snapshot.storage, status: 'unavailable', latencyMs: null, cached: true },
      scheduler: {
        ...snapshot.scheduler,
        runtimeStatus: 'stopped',
        lastPollAt: timestamp,
        lastPollStatus: 'failure',
        shared: { runningCount: null, overdueCount: null, oldestOverdueAt: null },
      },
    }
    expect(systemHealthSnapshotSchema.parse(unavailable)).toEqual(unavailable)
  })

  it('rejects sensitive extra fields throughout snapshot objects', () => {
    for (const path of [
      [],
      ['instance'],
      ['instance', 'memory'],
      ['database'],
      ['storage'],
      ['scheduler'],
      ['scheduler', 'shared'],
    ]) {
      const input = systemHealthSnapshotSchema.parse(snapshot)
      let target: Record<string, unknown> = input
      for (const key of path) target = target[key] as Record<string, unknown>
      target.secret = 'internal diagnostic'
      expectZodIssue(systemHealthSnapshotSchema.safeParse(input), {
        message: 'Unrecognized key: "secret"',
        path,
      })
    }
  })

  it('rejects negative, fractional and unsafe diagnostic measurements', () => {
    for (const value of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      expectZodIssue(
        systemHealthSnapshotSchema.safeParse({
          ...snapshot,
          instance: { ...snapshot.instance, uptimeSeconds: value },
        }),
        { message: '健康指标必须是非负安全整数', path: ['instance', 'uptimeSeconds'] },
      )
      expectZodIssue(
        systemHealthSnapshotSchema.safeParse({
          ...snapshot,
          database: { ...snapshot.database, latencyMs: value },
        }),
        { message: '健康指标必须是非负安全整数', path: ['database', 'latencyMs'] },
      )
      expectZodIssue(
        systemHealthSnapshotSchema.safeParse({
          ...snapshot,
          instance: {
            ...snapshot.instance,
            memory: { ...snapshot.instance.memory, rssBytes: value },
          },
        }),
        { message: '健康指标必须是非负安全整数', path: ['instance', 'memory', 'rssBytes'] },
      )
      expectZodIssue(
        systemHealthSnapshotSchema.safeParse({
          ...snapshot,
          scheduler: { ...snapshot.scheduler, automaticRunning: value },
        }),
        { message: '健康指标必须是非负安全整数', path: ['scheduler', 'automaticRunning'] },
      )
    }
    expectZodIssue(
      systemHealthSnapshotSchema.safeParse({ ...snapshot, observedAt: '2026-09-01' }),
      { message: 'Invalid ISO datetime', path: ['observedAt'] },
    )
  })

  it('accepts fixed-window statistics and failure or interrupted anomalies', () => {
    expect(systemHealthJobStatisticsSchema.parse(statistics)).toEqual(statistics)
    const interrupted = {
      ...anomaly,
      status: 'interrupted',
      errorCategory: null,
      errorSummary: null,
    }
    expect(
      systemHealthJobStatisticsSchema.parse({ ...statistics, recentAnomalies: [interrupted] })
        .recentAnomalies,
    ).toEqual([interrupted])
    expect(
      systemHealthJobStatisticsSchema.parse({
        ...statistics,
        averageDurations: [],
        recentAnomalies: [],
      }).recentAnomalies,
    ).toEqual([])
  })

  it('enforces anomaly status, classification and safe summary combinations', () => {
    expectZodIssue(
      systemHealthJobStatisticsSchema.safeParse({
        ...statistics,
        recentAnomalies: [{ ...anomaly, errorCategory: null }],
      }),
      { message: '定时任务错误分类无效', path: ['recentAnomalies', 0, 'errorCategory'] },
    )
    expectZodIssue(
      systemHealthJobStatisticsSchema.safeParse({
        ...statistics,
        recentAnomalies: [{ ...anomaly, errorSummary: ' ' }],
      }),
      { message: '快照字段不能为空', path: ['recentAnomalies', 0, 'errorSummary'] },
    )
    expectZodIssue(
      systemHealthJobStatisticsSchema.safeParse({
        ...statistics,
        recentAnomalies: [{ ...anomaly, status: 'interrupted' }],
      }),
      {
        message: 'Invalid input: expected null, received string',
        path: ['recentAnomalies', 0, 'errorCategory'],
      },
    )
    expectZodIssue(
      systemHealthJobStatisticsSchema.safeParse({
        ...statistics,
        recentAnomalies: [{ ...anomaly, status: 'cancelled' }],
      }),
      {
        message: "Invalid discriminator value. Expected 'failure' | 'interrupted'",
        path: ['recentAnomalies', 0, 'status'],
      },
    )
  })

  it('reuses task key and UUID constraints and rejects invalid dates and measurements', () => {
    expectZodIssue(
      systemHealthJobStatisticsSchema.safeParse({
        ...statistics,
        recentAnomalies: [{ ...anomaly, runId: 'run-1' }],
      }),
      { message: '任务运行 ID 无效', path: ['recentAnomalies', 0, 'runId'] },
    )
    expectZodIssue(
      systemHealthJobStatisticsSchema.safeParse({
        ...statistics,
        averageDurations: [{ ...statistics.averageDurations[0], taskKey: 'Invalid_Key' }],
      }),
      { message: '定时任务键格式无效', path: ['averageDurations', 0, 'taskKey'] },
    )
    expectZodIssue(
      systemHealthJobStatisticsSchema.safeParse({
        ...statistics,
        dailyRuns: [{ date: '2026-02-30', ...counts }, ...statistics.dailyRuns.slice(1)],
      }),
      { message: 'Invalid ISO date', path: ['dailyRuns', 0, 'date'] },
    )
    expectZodIssue(
      systemHealthJobStatisticsSchema.safeParse({
        ...statistics,
        statusDistribution: { ...counts, failure: -1 },
      }),
      { message: '健康指标必须是非负安全整数', path: ['statusDistribution', 'failure'] },
    )
  })

  it('keeps every statistics object strict and limits fixed result sizes', () => {
    for (const path of [
      [],
      ['dailyRuns', 0],
      ['statusDistribution'],
      ['failureCategories', 0],
      ['averageDurations', 0],
      ['recentAnomalies', 0],
    ] satisfies (string | number)[][]) {
      const input = systemHealthJobStatisticsSchema.parse(statistics)
      let target: Record<string | number, unknown> = input
      for (const key of path) target = target[key] as Record<string | number, unknown>
      target.secret = 'internal diagnostic'
      expectZodIssue(systemHealthJobStatisticsSchema.safeParse(input), {
        message: 'Unrecognized key: "secret"',
        path,
      })
    }
    expectZodIssue(systemHealthJobStatisticsSchema.safeParse({ ...statistics, dailyRuns: [] }), {
      message: '每日统计必须包含 7 天',
      path: ['dailyRuns'],
    })
    expectZodIssue(
      systemHealthJobStatisticsSchema.safeParse({ ...statistics, failureCategories: [] }),
      { message: '失败分类必须包含 4 项', path: ['failureCategories'] },
    )
    expectZodIssue(
      systemHealthJobStatisticsSchema.safeParse({
        ...statistics,
        recentAnomalies: Array.from({ length: 6 }, () => anomaly),
      }),
      { message: '最近异常最多包含 5 条', path: ['recentAnomalies'] },
    )
  })
})
