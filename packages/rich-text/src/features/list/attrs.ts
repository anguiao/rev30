export const orderedListTypes = ['1', 'a', 'A', 'i', 'I'] as const

export type OrderedListType = (typeof orderedListTypes)[number]

const orderedListTypeSet = new Set<string>(orderedListTypes)
const orderedListStartPattern = /^-?\d+$/

export function normalizeOrderedListStart(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) ? value : null
  }

  if (typeof value !== 'string' || !orderedListStartPattern.test(value)) {
    return null
  }

  const start = Number(value)

  return Number.isSafeInteger(start) ? start : null
}

export function normalizeOrderedListType(value: unknown): OrderedListType | null {
  return typeof value === 'string' && orderedListTypeSet.has(value)
    ? (value as OrderedListType)
    : null
}
