export const MAX_GRID_SLOTS_PER_TABLE = 10_000

type TableCellAlign = 'left' | 'center' | 'right'

const tableCellAlignments = new Set<string>(['left', 'center', 'right'])
const positiveIntegerPattern = /^[1-9]\d*$/

export function isValidTableCellSpan(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= MAX_GRID_SLOTS_PER_TABLE
  )
}

export function normalizeTableCellSpan(value: unknown): number {
  if (typeof value === 'number') {
    return isValidTableCellSpan(value) ? value : 1
  }

  if (typeof value !== 'string' || !positiveIntegerPattern.test(value)) {
    return 1
  }

  const span = Number(value)

  return isValidTableCellSpan(span) ? span : 1
}

export function isValidTableColwidth(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.every((width) => typeof width === 'number' && Number.isFinite(width))
  )
}

export function normalizeTableColwidth(value: unknown): number[] | null {
  if (isValidTableColwidth(value)) {
    return value
  }

  if (typeof value !== 'string') {
    return null
  }

  const values = value.split(',')

  if (values.some((item) => item.trim() === '')) {
    return null
  }

  const colwidth = values.map((item) => Number(item.trim()))

  return colwidth.every(Number.isFinite) ? colwidth : null
}

export function normalizeTableCellAlign(value: unknown): TableCellAlign | null {
  if (typeof value !== 'string') {
    return null
  }

  const align = value.trim().toLowerCase()

  return tableCellAlignments.has(align) ? (align as TableCellAlign) : null
}

export function isValidTableCellAlign(value: unknown): value is TableCellAlign {
  return typeof value === 'string' && tableCellAlignments.has(value)
}
