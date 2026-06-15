import type { CustomIconItem, CustomIconSet } from '@rev30/contracts'
import { toIsoDateTime } from '@rev30/utils'
import { customIconSetIcons, customIconSets } from '../../../../db/schema'

export type SetRow = typeof customIconSets.$inferSelect
export type IconRow = typeof customIconSetIcons.$inferSelect & {
  prefix: string
  setName: string
}

export function mapCustomIconSet(row: SetRow & { iconCount: number }): CustomIconSet {
  return {
    prefix: row.prefix,
    name: row.name,
    description: row.description,
    iconCount: row.iconCount,
    createdAt: toIsoDateTime(row.createdAt),
    updatedAt: toIsoDateTime(row.updatedAt),
  }
}

export function mapCustomIcon(row: IconRow): CustomIconItem {
  return {
    icon: `${row.prefix}:${row.name}`,
    prefix: row.prefix,
    name: row.name,
    setName: row.setName,
    body: row.body,
    width: row.width,
    height: row.height,
    createdAt: toIsoDateTime(row.createdAt),
    updatedAt: toIsoDateTime(row.updatedAt),
  }
}
