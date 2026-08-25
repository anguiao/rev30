import { describe, expect, it } from 'vitest'
import { getNextCronOccurrences, validateCronSchedule } from '../src'

describe('cron schedule utilities', () => {
  it('validates a five-part schedule without changing the input object', () => {
    const input = {
      expression: '0 9 * JAN MON-FRI',
      timezone: 'Asia/Shanghai',
    }
    const snapshot = { ...input }

    expect(validateCronSchedule(input)).toEqual(input)
    expect(input).toEqual(snapshot)
  })

  it('accepts supported aliases and cron punctuation', () => {
    expect(
      validateCronSchedule({ expression: '*/15 0-23 * JAN,MAR MON,WED-FRI', timezone: 'UTC' }),
    ).toEqual({ expression: '*/15 0-23 * JAN,MAR MON,WED-FRI', timezone: 'UTC' })
  })

  it('rejects unsupported field counts, characters, aliases, timezones, and empty schedules', () => {
    const invalidInputs = [
      { expression: '* * * *', timezone: 'UTC' },
      { expression: '* * * * * *', timezone: 'UTC' },
      { expression: '@daily', timezone: 'UTC' },
      { expression: '0 0 * * ? ', timezone: 'UTC' },
      { expression: '0 0 * * MON#2', timezone: 'UTC' },
      { expression: '0 0 31 2 *', timezone: 'UTC' },
      { expression: '0 0 * * *', timezone: 'Not/AnIanaZone' },
    ]

    for (const input of invalidInputs) {
      expect(() => validateCronSchedule(input)).toThrow()
    }
  })

  it('returns exactly the requested number of occurrences strictly after from', () => {
    const from = new Date('2026-01-01T00:00:00.000Z')

    expect(
      getNextCronOccurrences({
        expression: '0 * * * *',
        timezone: 'UTC',
        from,
        count: 3,
      }),
    ).toEqual([
      new Date('2026-01-01T01:00:00.000Z'),
      new Date('2026-01-01T02:00:00.000Z'),
      new Date('2026-01-01T03:00:00.000Z'),
    ])
    expect(from).toEqual(new Date('2026-01-01T00:00:00.000Z'))
  })

  it('calculates absolute dates in the requested IANA timezone across a DST jump', () => {
    const occurrences = getNextCronOccurrences({
      expression: '30 2 * * *',
      timezone: 'America/New_York',
      from: new Date('2026-03-07T00:00:00.000Z'),
      count: 3,
    })

    expect(occurrences).toEqual([
      new Date('2026-03-07T07:30:00.000Z'),
      new Date('2026-03-08T07:30:00.000Z'),
      new Date('2026-03-09T06:30:00.000Z'),
    ])
    expect(occurrences.every((value) => value > new Date('2026-03-07T00:00:00.000Z'))).toBe(true)
  })

  it('rejects invalid occurrence requests and never returns a partial result', () => {
    const input = {
      expression: '0 0 * * *',
      timezone: 'UTC',
      from: new Date('2026-01-01T00:00:00.000Z'),
    }

    expect(() => getNextCronOccurrences({ ...input, count: 0 })).toThrow()
    expect(() => getNextCronOccurrences({ ...input, count: -1 })).toThrow()
    expect(() => getNextCronOccurrences({ ...input, count: 1.5 })).toThrow()
    expect(() =>
      getNextCronOccurrences({ ...input, count: 2, from: new Date('invalid') }),
    ).toThrow()
    expect(() => getNextCronOccurrences({ ...input, count: 2, expression: '0 0 31 2 *' })).toThrow()
  })
})
