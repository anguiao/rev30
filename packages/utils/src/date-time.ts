import {
  addMilliseconds as addDateFnsMilliseconds,
  addSeconds as addDateFnsSeconds,
  differenceInMilliseconds,
  format,
  fromUnixTime,
  getUnixTime,
  isBefore,
  isEqual,
  parseISO,
  subMilliseconds as subDateFnsMilliseconds,
  subSeconds as subDateFnsSeconds,
} from 'date-fns'

export type IsoDateTimeString = string
export type UnixTimeSeconds = number
export type DateTimeInput = Date | IsoDateTimeString

const displayDateTimeFormat = 'yyyy/MM/dd HH:mm'

function toDateTime(value: DateTimeInput) {
  return typeof value === 'string' ? parseISO(value) : value
}

export function parseIsoDateTime(value: IsoDateTimeString) {
  return parseISO(value)
}

export function toIsoDateTime(value: Date): IsoDateTimeString {
  return value.toISOString()
}

export function formatDisplayDateTime(value: DateTimeInput) {
  return format(toDateTime(value), displayDateTimeFormat)
}

export function addSeconds(value: DateTimeInput, seconds: number) {
  return addDateFnsSeconds(toDateTime(value), seconds)
}

export function subSeconds(value: DateTimeInput, seconds: number) {
  return subDateFnsSeconds(toDateTime(value), seconds)
}

export function addMilliseconds(value: DateTimeInput, milliseconds: number) {
  return addDateFnsMilliseconds(toDateTime(value), milliseconds)
}

export function subMilliseconds(value: DateTimeInput, milliseconds: number) {
  return subDateFnsMilliseconds(toDateTime(value), milliseconds)
}

export function millisecondsBetween(later: DateTimeInput, earlier: DateTimeInput) {
  return differenceInMilliseconds(toDateTime(later), toDateTime(earlier))
}

export function millisecondsUntil(value: DateTimeInput, now: DateTimeInput = new Date()) {
  return millisecondsBetween(value, now)
}

export function isExpiredAt(expiresAt: DateTimeInput, now: DateTimeInput = new Date()) {
  const expiresAtDate = toDateTime(expiresAt)
  const nowDate = toDateTime(now)

  return isBefore(expiresAtDate, nowDate) || isEqual(expiresAtDate, nowDate)
}

export function toUnixTimeSeconds(value: DateTimeInput): UnixTimeSeconds {
  return getUnixTime(toDateTime(value))
}

export function fromUnixTimeSeconds(value: UnixTimeSeconds) {
  return fromUnixTime(value)
}
