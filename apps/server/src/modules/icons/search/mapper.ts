import type { IconSearchItem } from '@rev30/contracts'

export type CustomIconSearchEntry = Omit<IconSearchItem, 'icon'>

export function toCustomIconSearchItem(entry: CustomIconSearchEntry): IconSearchItem {
  return {
    icon: `${entry.prefix}:${entry.name}`,
    prefix: entry.prefix,
    name: entry.name,
    collection: entry.collection,
    palette: entry.palette,
  }
}
