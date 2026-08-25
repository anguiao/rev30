import { Cron } from 'croner'

const CRON_FIELD_COUNT = 5
const MAX_OCCURRENCE_COUNT = 100
const MONTH_ALIASES = new Set([
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
])
const WEEKDAY_ALIASES = new Set(['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'])
const CRON_FIELD_PATTERN = /^[0-9A-Za-z*,\-/]+$/
const CRON_ALIAS_PATTERN = /[A-Z]+/gi
const VALIDATION_PROBE_DATE = new Date('2000-01-01T00:00:00.000Z')

export type CronScheduleInput = {
  expression: string
  timezone: string
}

export type CronOccurrenceInput = CronScheduleInput & {
  from: Date
  count: number
}

function normalizeScheduleInput(input: CronScheduleInput): CronScheduleInput {
  if (typeof input !== 'object' || input === null) {
    throw new TypeError('Cron 计划必须是对象')
  }

  if (typeof input.expression !== 'string') {
    throw new TypeError('Cron 表达式必须是字符串')
  }

  if (typeof input.timezone !== 'string') {
    throw new TypeError('时区必须是字符串')
  }

  const fields = input.expression.trim().split(/\s+/).filter(Boolean)
  if (fields.length !== CRON_FIELD_COUNT) {
    throw new Error('Cron 表达式必须包含五个字段')
  }

  const expression = fields.join(' ')
  for (const [index, field] of fields.entries()) {
    if (!CRON_FIELD_PATTERN.test(field)) {
      throw new Error('Cron 表达式包含不支持的字符')
    }

    const aliases = index === 3 ? MONTH_ALIASES : index === 4 ? WEEKDAY_ALIASES : undefined
    for (const alias of field.match(CRON_ALIAS_PATTERN) ?? []) {
      if (aliases === undefined || !aliases.has(alias.toUpperCase())) {
        throw new Error('Cron 表达式别名无效')
      }
    }
  }

  const timezone = input.timezone.trim()
  if (timezone.length === 0) {
    throw new Error('时区不能为空')
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(VALIDATION_PROBE_DATE)
  } catch {
    throw new Error('时区必须是有效的 IANA 时区')
  }

  return { expression, timezone }
}

function createCronSchedule(input: CronScheduleInput) {
  try {
    return new Cron(input.expression, {
      mode: '5-part',
      paused: true,
      timezone: input.timezone,
    })
  } catch {
    throw new Error('Cron 表达式无效')
  }
}

function getOccurrences(schedule: CronScheduleInput, from: Date, count: number): Date[] {
  const cron = createCronSchedule(schedule)

  try {
    const occurrences = cron.nextRuns(count, new Date(from.getTime()))
    if (
      occurrences.length !== count ||
      occurrences.some((occurrence) => occurrence.getTime() <= from.getTime())
    ) {
      throw new Error('Cron 表达式不能产生足够的未来时刻')
    }

    return occurrences.map((occurrence) => new Date(occurrence.getTime()))
  } catch (error) {
    if (error instanceof Error && error.message === 'Cron 表达式不能产生足够的未来时刻') {
      throw error
    }

    throw new Error('Cron 表达式无法计算未来时刻')
  } finally {
    cron.stop()
  }
}

export function validateCronSchedule(input: CronScheduleInput): CronScheduleInput {
  const schedule = normalizeScheduleInput(input)
  getOccurrences(schedule, VALIDATION_PROBE_DATE, 1)
  return schedule
}

export function getNextCronOccurrences(input: CronOccurrenceInput): Date[] {
  if (typeof input !== 'object' || input === null) {
    throw new TypeError('Cron 计算参数必须是对象')
  }

  const schedule = normalizeScheduleInput(input)

  if (!(input.from instanceof Date) || Number.isNaN(input.from.getTime())) {
    throw new TypeError('起始时间必须是有效的 Date')
  }

  if (!Number.isSafeInteger(input.count) || input.count < 1 || input.count > MAX_OCCURRENCE_COUNT) {
    throw new RangeError('未来时刻数量必须是 1 到 100 之间的安全整数')
  }

  return getOccurrences(schedule, input.from, input.count)
}
