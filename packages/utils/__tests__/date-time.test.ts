import { describe, expect, it } from 'vitest'
import {
  addMilliseconds,
  addSeconds,
  formatDisplayDateTime,
  fromUnixTimeSeconds,
  isExpiredAt,
  millisecondsBetween,
  millisecondsUntil,
  subMilliseconds,
  subSeconds,
  toIsoDateTime,
  toUnixTimeSeconds,
} from '../src'

describe('date time utils', () => {
  it('formats date time values for display', () => {
    expect(formatDisplayDateTime(new Date(2026, 4, 18, 1, 2, 3))).toBe('2026/05/18 01:02')
  })

  it.each(['2026-05-18T01:02:03.000Z', new Date('2026-05-18T01:02:03.000Z')])(
    'adds and subtracts seconds from %s without changing the input',
    (now) => {
      const snapshot = structuredClone(now)

      expect(toIsoDateTime(addSeconds(now, 60))).toBe('2026-05-18T01:03:03.000Z')
      expect(toIsoDateTime(subSeconds(now, 60))).toBe('2026-05-18T01:01:03.000Z')
      expect(now).toEqual(snapshot)
    },
  )

  it.each(['2026-05-18T01:02:03.500Z', new Date('2026-05-18T01:02:03.500Z')])(
    'adds and subtracts milliseconds from %s without changing the input',
    (now) => {
      const snapshot = structuredClone(now)

      expect(toIsoDateTime(addMilliseconds(now, 250))).toBe('2026-05-18T01:02:03.750Z')
      expect(toIsoDateTime(subMilliseconds(now, 250))).toBe('2026-05-18T01:02:03.250Z')
      expect(now).toEqual(snapshot)
    },
  )

  it('calculates date time differences', () => {
    const now = new Date('2026-05-18T01:02:03.000Z')
    const expiresAt = '2026-05-18T01:02:33.000Z'

    expect(millisecondsBetween(expiresAt, now)).toBe(30_000)
    expect(millisecondsUntil(expiresAt, now)).toBe(30_000)
    expect(millisecondsBetween(now, expiresAt)).toBe(-30_000)
    expect(millisecondsUntil(now, expiresAt)).toBe(-30_000)
  })

  it('checks expired date time values inclusively', () => {
    const now = new Date('2026-05-18T01:02:03.000Z')

    expect(isExpiredAt('2026-05-18T01:02:02.999Z', now)).toBe(true)
    expect(isExpiredAt('2026-05-18T01:02:03.000Z', now)).toBe(true)
    expect(isExpiredAt('2026-05-18T01:02:03.001Z', now)).toBe(false)
  })

  it('converts date time values to unix seconds', () => {
    const seconds = toUnixTimeSeconds(new Date('2026-05-18T01:02:03.999Z'))
    expect(seconds).toBe(1_779_066_123)
    expect(toIsoDateTime(fromUnixTimeSeconds(seconds))).toBe('2026-05-18T01:02:03.000Z')
  })
})
