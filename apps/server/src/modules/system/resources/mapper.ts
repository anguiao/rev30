import { arrayToTree, type Resource, type ResourceTreeNode } from '@rev30/shared'
import { systemResources } from '../../../db/schema'

export type ResourceRow = typeof systemResources.$inferSelect

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
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function toResourceTree(rows: ResourceRow[]): ResourceTreeNode[] {
  return arrayToTree(rows.map(toResource))
}
