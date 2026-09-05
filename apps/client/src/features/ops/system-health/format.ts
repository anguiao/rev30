const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})
const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

export function formatHealthDateTime(value: string | number | null) {
  return value === null ? '暂无' : dateTimeFormatter.format(new Date(value))
}

export function formatHealthTime(value: string | number) {
  return timeFormatter.format(new Date(value))
}

export function formatHealthLatency(value: number | null) {
  return value === null ? '不可用' : `${value} ms`
}
