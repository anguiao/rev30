import type { TagProps } from 'naive-ui'
import type { SystemHealthIssue, SystemHealthStatus } from '@rev30/contracts'

export const systemHealthStatusLabels = {
  healthy: '健康',
  degraded: '降级',
  unhealthy: '不健康',
} as const satisfies Record<SystemHealthStatus, string>

export const systemHealthStatusTagTypes = {
  healthy: 'success',
  degraded: 'warning',
  unhealthy: 'error',
} as const satisfies Record<SystemHealthStatus, TagProps['type']>

export const systemHealthIssueLabels = {
  database_unavailable: '数据库不可用',
  storage_unavailable: '附件存储不可用',
  scheduler_stopped: '调度器已停止',
  scheduler_query_retry: '任务调度检查失败',
  scheduler_overdue: '任务启动延迟',
} as const satisfies Record<SystemHealthIssue, string>
