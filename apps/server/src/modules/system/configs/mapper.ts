import type { Config, ConfigListItem } from '@rev30/shared'
import { systemConfigs } from '../../../db/schema'

export type ConfigRow = typeof systemConfigs.$inferSelect

export function toConfig(row: ConfigRow): Config {
  return {
    id: row.id,
    groupCode: row.groupCode,
    key: row.key,
    name: row.name,
    valueType: row.valueType as Config['valueType'],
    value: row.value,
    description: row.description,
    status: row.status as Config['status'],
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function toConfigListItem(row: ConfigRow): ConfigListItem {
  const { sortOrder: _sortOrder, ...config } = toConfig(row)

  return config
}
