import type { SystemHealthSnapshot, SystemHealthJobStatistics } from '@rev30/contracts'

export function healthSnapshot(seconds = 0): SystemHealthSnapshot {
  const time = new Date(Date.parse('2026-09-01T04:00:00.000Z') + seconds * 1000).toISOString()
  return {
    observedAt: time,
    status: 'healthy',
    issues: [],
    instance: {
      startedAt: '2026-09-01T00:00:00.000Z',
      uptimeSeconds: 14400 + seconds,
      nodeVersion: 'v24.7.0',
      platform: 'linux',
      arch: 'x64',
      memory: {
        rssBytes: 104857600,
        heapUsedBytes: 52428800,
        heapTotalBytes: 62914560,
        externalBytes: 1024,
      },
    },
    database: { status: 'healthy', latencyMs: 3, checkedAt: time },
    storage: { status: 'healthy', provider: 'local', latencyMs: 5, checkedAt: time, cached: false },
    scheduler: {
      runtimeStatus: 'running',
      automaticCapacity: 2,
      automaticRunning: 1,
      manualStarting: 0,
      recoveryQueued: 0,
      retryPending: false,
      nextWakeAt: null,
      lastPollAt: time,
      lastPollStatus: 'success',
      shared: { runningCount: 1, overdueCount: 0, oldestOverdueAt: null },
    },
  }
}

export function healthStatistics(): SystemHealthJobStatistics {
  return {
    generatedAt: '2026-09-01T04:00:01.000Z',
    timezone: 'Asia/Shanghai',
    dailyRuns: Array.from({ length: 7 }, (_, index) => ({
      date: new Date(Date.parse('2026-08-26') + index * 86400000).toISOString().slice(0, 10),
      running: 0,
      success: index,
      failure: 0,
      skipped: 0,
      cancelled: 0,
      interrupted: 0,
    })),
    statusDistribution: {
      running: 1,
      success: 21,
      failure: 2,
      skipped: 0,
      cancelled: 0,
      interrupted: 1,
    },
    failureCategories: [
      { category: 'partial_failure', count: 0 },
      { category: 'database', count: 2 },
      { category: 'storage', count: 0 },
      { category: 'internal', count: 0 },
    ],
    averageDurations: [
      {
        taskKey: 'auth-session-cleanup',
        taskName: '认证会话清理',
        averageDurationMs: 1250,
        runCount: 21,
      },
    ],
    recentAnomalies: [
      {
        taskKey: 'auth-session-cleanup',
        taskName: '认证会话清理',
        runId: '11111111-1111-4111-8111-111111111111',
        finishedAt: '2026-09-01T03:59:01.000Z',
        status: 'failure',
        errorCategory: 'database',
        errorSummary: '数据库操作失败',
      },
    ],
  }
}
