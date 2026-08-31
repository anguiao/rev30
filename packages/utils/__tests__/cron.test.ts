import { describe, expect, it } from 'vitest'
import { getNextCronOccurrences, parseCronSchedule } from '../src'

describe('cron schedule utilities', () => {
  it('parses a five-part schedule without changing the input object', () => {
    const from = new Date('2026-01-01T00:00:00.000Z')
    const input = {
      expression: '  0  9  *  JAN  MON-FRI  ',
      timezone: '  Asia/Shanghai  ',
    }
    const snapshot = { ...input }

    expect(parseCronSchedule(input, from)).toEqual({
      expression: '0 9 * JAN MON-FRI',
      timezone: 'Asia/Shanghai',
    })
    expect(input).toEqual(snapshot)
  })

  it('accepts syntax supported by Croner in five-part mode', () => {
    const from = new Date('2026-01-01T00:00:00.000Z')

    expect(
      parseCronSchedule({ expression: '*/15 0-23 * JAN,MAR MON,WED-FRI', timezone: 'UTC' }, from),
    ).toEqual({ expression: '*/15 0-23 * JAN,MAR MON,WED-FRI', timezone: 'UTC' })
    expect(parseCronSchedule({ expression: '@daily', timezone: 'UTC' }, from)).toEqual({
      expression: '@daily',
      timezone: 'UTC',
    })
  })

  it('rejects invalid expressions, timezones, and schedules without future occurrences', () => {
    const from = new Date('2026-01-01T00:00:00.000Z')
    const invalidInputs = [
      { expression: '', timezone: 'UTC' },
      { expression: '* * * *', timezone: 'UTC' },
      { expression: '* * * * * *', timezone: 'UTC' },
      { expression: '0 0 * FOO *', timezone: 'UTC' },
      { expression: '0 0 31 2 *', timezone: 'UTC' },
      { expression: '0 0 * * *', timezone: 'Not/AnIanaZone' },
    ]

    for (const input of invalidInputs) {
      expect(() => parseCronSchedule(input, from)).toThrow()
    }
  })

  it('returns exactly the requested number of occurrences strictly after from', () => {
    const from = new Date('2026-01-01T00:00:00.000Z')

    expect(getNextCronOccurrences({ expression: '0 * * * *', timezone: 'UTC' }, from, 3)).toEqual([
      new Date('2026-01-01T01:00:00.000Z'),
      new Date('2026-01-01T02:00:00.000Z'),
      new Date('2026-01-01T03:00:00.000Z'),
    ])
    expect(from).toEqual(new Date('2026-01-01T00:00:00.000Z'))
  })

  it('calculates absolute dates in the requested IANA timezone across a DST jump', () => {
    const from = new Date('2026-03-07T00:00:00.000Z')
    const occurrences = getNextCronOccurrences(
      { expression: '30 2 * * *', timezone: 'America/New_York' },
      from,
      3,
    )

    expect(occurrences).toEqual([
      new Date('2026-03-07T07:30:00.000Z'),
      new Date('2026-03-08T07:30:00.000Z'),
      new Date('2026-03-09T06:30:00.000Z'),
    ])
    expect(occurrences.every((value) => value > new Date('2026-03-07T00:00:00.000Z'))).toBe(true)
  })

  it('rejects invalid occurrence requests and never returns a partial result', () => {
    const schedule = {
      expression: '0 0 * * *',
      timezone: 'UTC',
    }
    const from = new Date('2026-01-01T00:00:00.000Z')

    expect(() => getNextCronOccurrences(schedule, from, 0)).toThrow()
    expect(() => getNextCronOccurrences(schedule, from, -1)).toThrow()
    expect(() => getNextCronOccurrences(schedule, from, 1.5)).toThrow()
    expect(() => getNextCronOccurrences(schedule, from, Number.MAX_SAFE_INTEGER + 1)).toThrow()
    expect(() => getNextCronOccurrences(schedule, new Date('invalid'), 2)).toThrow()
    expect(() =>
      getNextCronOccurrences({ ...schedule, expression: '0 0 31 2 *' }, from, 2),
    ).toThrow()
  })
})
