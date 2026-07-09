import type { CustomIconItem, CustomIconSet } from '@rev30/contracts'
import { toIsoDateTime } from '@rev30/utils'
import { customIconSetIcons, customIconSets } from '../../../../db/schema'

export type CustomIconSetRow = typeof customIconSets.$inferSelect
export type CustomIconEntry = typeof customIconSetIcons.$inferSelect & {
  prefix: string
  setName: string
}

export type CustomIconSetEntry = {
  set: CustomIconSetRow
  iconCount: number
}

export function mapCustomIconSet(entry: CustomIconSetEntry): CustomIconSet {
  const { set, iconCount } = entry

  return {
    prefix: set.prefix,
    name: set.name,
    description: set.description,
    iconCount,
    createdAt: toIsoDateTime(set.createdAt),
    updatedAt: toIsoDateTime(set.updatedAt),
  }
}

export function mapCustomIcon(entry: CustomIconEntry): CustomIconItem {
  return {
    icon: `${entry.prefix}:${entry.name}`,
    prefix: entry.prefix,
    name: entry.name,
    setName: entry.setName,
    body: entry.body,
    width: entry.width,
    height: entry.height,
    createdAt: toIsoDateTime(entry.createdAt),
    updatedAt: toIsoDateTime(entry.updatedAt),
  }
}
