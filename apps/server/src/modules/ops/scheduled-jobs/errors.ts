export class ScheduledJobExecutionError extends Error {
  constructor(
    readonly category: 'database' | 'storage',
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

export class ScheduledJobNotFoundError extends Error {
  constructor() {
    super('定时任务或运行不存在')
    this.name = 'ScheduledJobNotFoundError'
  }
}

export class ScheduledJobStateConflictError extends Error {
  constructor() {
    super('定时任务运行状态冲突')
    this.name = 'ScheduledJobStateConflictError'
  }
}
