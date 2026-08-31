import { Cron } from 'croner'

export type CronSchedule = {
  expression: string
  timezone: string
}

function normalizeCronSchedule(schedule: CronSchedule): CronSchedule {
  const expression = schedule.expression.trim().replace(/\s+/g, ' ')
  const timezone = schedule.timezone.trim()
  if (timezone.length === 0) {
    throw new Error('时区不能为空')
  }

  return { expression, timezone }
}

function getOccurrences(schedule: CronSchedule, from: Date, count: number): Date[] {
  if (!(from instanceof Date) || Number.isNaN(from.getTime())) {
    throw new TypeError('起始时间必须是有效的 Date')
  }

  if (!Number.isSafeInteger(count) || count < 1) {
    throw new RangeError('未来时刻数量必须是正安全整数')
  }

  let occurrences: Date[]
  try {
    occurrences = new Cron(schedule.expression, {
      mode: '5-part',
      timezone: schedule.timezone,
    }).nextRuns(count, from)
  } catch {
    throw new Error('Cron 表达式或时区无效')
  }

  if (
    occurrences.length !== count ||
    occurrences.some((occurrence) => occurrence.getTime() <= from.getTime())
  ) {
    throw new Error('Cron 表达式不能产生足够的未来时刻')
  }

  return occurrences
}

export function parseCronSchedule(schedule: CronSchedule, from: Date): CronSchedule {
  const normalized = normalizeCronSchedule(schedule)
  getOccurrences(normalized, from, 1)
  return normalized
}

export function getNextCronOccurrences(schedule: CronSchedule, from: Date, count: number): Date[] {
  const normalized = normalizeCronSchedule(schedule)
  return getOccurrences(normalized, from, count)
}
