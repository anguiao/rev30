import type { IconSearchItem } from '@rev30/contracts'

export type CustomIconSearchRow = Omit<IconSearchItem, 'icon'>

export function toCustomIconSearchItem(row: CustomIconSearchRow): IconSearchItem {
  return {
    icon: `${row.prefix}:${row.name}`,
    prefix: row.prefix,
    name: row.name,
    collection: row.collection,
    palette: row.palette,
  }
}
