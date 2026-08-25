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
