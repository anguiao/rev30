import type {
  DictionaryDetail,
  DictionaryItem,
  DictionaryListItem,
  DictionaryType,
} from '@rev30/contracts'
import { toIsoDateTime } from '@rev30/utils'
import { systemDictionaryItems, systemDictionaryTypes } from '../../../db/schema'

export type DictionaryTypeRow = typeof systemDictionaryTypes.$inferSelect
export type DictionaryItemRow = typeof systemDictionaryItems.$inferSelect

export type DictionaryListRow = {
  type: DictionaryTypeRow
  itemCount: number
}
export type DictionaryOptionRow = Pick<DictionaryTypeRow, 'code'> &
  Pick<DictionaryItemRow, 'label' | 'value'>

export function toDictionaryType(row: DictionaryTypeRow): DictionaryType {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    status: row.status as DictionaryType['status'],
    sortOrder: row.sortOrder,
    createdAt: toIsoDateTime(row.createdAt),
    updatedAt: toIsoDateTime(row.updatedAt),
  }
}

export function toDictionaryItem(row: DictionaryItemRow): DictionaryItem {
  return {
    id: row.id,
    typeId: row.typeId,
    label: row.label,
    value: row.value,
    description: row.description,
    status: row.status as DictionaryItem['status'],
    sortOrder: row.sortOrder,
    createdAt: toIsoDateTime(row.createdAt),
    updatedAt: toIsoDateTime(row.updatedAt),
  }
}

export function toDictionaryListItem(row: DictionaryListRow): DictionaryListItem {
  return {
    ...toDictionaryType(row.type),
    itemCount: row.itemCount,
  }
}

export function toDictionaryDetail(
  row: DictionaryTypeRow,
  items: DictionaryItemRow[],
): DictionaryDetail {
  return {
    ...toDictionaryType(row),
    items: items.map(toDictionaryItem),
  }
}
