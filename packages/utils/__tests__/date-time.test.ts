import { describe, expect, it } from 'vitest'
import {
  addMilliseconds,
  addSeconds,
  formatDisplayDateTime,
  fromUnixTimeSeconds,
  isExpiredAt,
  millisecondsBetween,
  millisecondsUntil,
  parseIsoDateTime,
  subMilliseconds,
  subSeconds,
  toIsoDateTime,
  toUnixTimeSeconds,
} from '../src'

describe('date time utils', () => {
  it('formats date time values for display', () => {
    expect(formatDisplayDateTime(new Date(2026, 4, 18, 1, 2, 3))).toBe('2026/05/18 01:02')
  })

  it('parses and serializes ISO date time values', () => {
    const value = '2026-05-18T01:02:03.000Z'
    const date = parseIsoDateTime(value)

    expect(toIsoDateTime(date)).toBe(value)
  })

  it('adds and subtracts seconds', () => {
    const now = new Date('2026-05-18T01:02:03.000Z')

    expect(toIsoDateTime(addSeconds(now, 60))).toBe('2026-05-18T01:03:03.000Z')
    expect(toIsoDateTime(subSeconds(now, 60))).toBe('2026-05-18T01:01:03.000Z')
  })

  it('adds and subtracts milliseconds', () => {
    const now = new Date('2026-05-18T01:02:03.500Z')

    expect(toIsoDateTime(addMilliseconds(now, 250))).toBe('2026-05-18T01:02:03.750Z')
    expect(toIsoDateTime(subMilliseconds(now, 250))).toBe('2026-05-18T01:02:03.250Z')
  })

  it('calculates date time differences', () => {
    const now = new Date('2026-05-18T01:02:03.000Z')
    const expiresAt = new Date('2026-05-18T01:02:33.000Z')

    expect(millisecondsBetween(expiresAt, now)).toBe(30_000)
    expect(millisecondsUntil(expiresAt, now)).toBe(30_000)
  })

  it('checks expired date time values inclusively', () => {
    const now = new Date('2026-05-18T01:02:03.000Z')

    expect(isExpiredAt('2026-05-18T01:02:02.999Z', now)).toBe(true)
    expect(isExpiredAt('2026-05-18T01:02:03.000Z', now)).toBe(true)
    expect(isExpiredAt('2026-05-18T01:02:03.001Z', now)).toBe(false)
  })

  it('converts date time values to unix seconds', () => {
    expect(toUnixTimeSeconds(new Date('2026-05-18T01:02:03.999Z'))).toBe(1_779_066_123)
  })

  it('converts unix seconds to date time values', () => {
    expect(toIsoDateTime(fromUnixTimeSeconds(1_779_066_123))).toBe('2026-05-18T01:02:03.000Z')
  })
})
