export type IconCursor = {
  prefix: string
  name: string
}

export function parseIconCursor(cursor?: string): IconCursor | undefined {
  if (!cursor) {
    return undefined
  }

  const [prefix, name] = cursor.split(':')

  return { prefix: prefix ?? '', name: name ?? '' }
}

export function formatIconCursor(prefix: string, name: string) {
  return `${prefix}:${name}`
}
