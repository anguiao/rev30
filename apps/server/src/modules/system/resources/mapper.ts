import type { Resource, ResourceTreeNode } from '@rev30/shared'
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
  const childrenByParentId = new Map<string | null, ResourceTreeNode[]>()
  const nodes = rows.map<ResourceTreeNode>((row) => ({
    ...toResource(row),
    children: [],
  }))

  for (const node of nodes) {
    const siblings = childrenByParentId.get(node.parentId) ?? []
    siblings.push(node)
    childrenByParentId.set(node.parentId, siblings)
  }

  for (const node of nodes) {
    node.children = childrenByParentId.get(node.id) ?? []
  }

  return childrenByParentId.get(null) ?? []
}
