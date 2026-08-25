export type ScheduledJobExecutionErrorCategory = 'database' | 'storage' | 'internal'

export class ScheduledJobExecutionError extends Error {
  constructor(
    readonly category: ScheduledJobExecutionErrorCategory,
    cause?: unknown,
  ) {
    super(
      category === 'database'
        ? 'Scheduled job database operation failed'
        : category === 'storage'
          ? 'Scheduled job storage operation failed'
          : 'Scheduled job execution failed',
      { cause },
    )
    this.name = 'ScheduledJobExecutionError'
  }
}

export class ScheduledJobInvalidPlanError extends Error {
  constructor() {
    super('Cron 表达式或时区无效')
    this.name = 'ScheduledJobInvalidPlanError'
  }
}
