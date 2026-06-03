import type { Resource, ResourceTreeNode, ResourceTreeOption } from '@rev30/contracts'
import { arrayToTree, toIsoDateTime } from '@rev30/utils'
import { systemResources } from '../../../db/schema'

export type ResourceRow = typeof systemResources.$inferSelect
export type ResourceTreeOptionRow = Pick<ResourceRow, keyof Omit<ResourceTreeOption, 'children'>>

export function toResource(row: ResourceRow): Resource {
  return {
    id: row.id,
    parentId: row.parentId,
    type: row.type as Resource['type'],
    name: row.name,
    code: row.code,
    path: row.path,
    externalUrl: row.externalUrl,
    openTarget: row.openTarget as Resource['openTarget'],
    icon: row.icon,
    hidden: row.hidden,
    status: row.status as Resource['status'],
    sortOrder: row.sortOrder,
    createdAt: toIsoDateTime(row.createdAt),
    updatedAt: toIsoDateTime(row.updatedAt),
  }
}

export function toResourceTree(rows: ResourceRow[]): ResourceTreeNode[] {
  return arrayToTree(rows.map(toResource))
}

export function toResourceTreeOption(row: ResourceTreeOptionRow): ResourceTreeOption {
  return {
    id: row.id,
    parentId: row.parentId,
    type: row.type as ResourceTreeOption['type'],
    name: row.name,
    code: row.code,
    status: row.status as ResourceTreeOption['status'],
    children: [],
  }
}

export function toResourceTreeOptions(rows: ResourceTreeOptionRow[]): ResourceTreeOption[] {
  return arrayToTree(rows.map(toResourceTreeOption))
}
