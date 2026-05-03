import type { Department, DepartmentTreeNode } from '@rev30/shared'
import { departments } from '../../../db/schema'

export type DepartmentRow = typeof departments.$inferSelect

export function toDepartment(row: DepartmentRow): Department {
  return {
    id: row.id,
    parentId: row.parentId,
    name: row.name,
    code: row.code,
    status: row.status as Department['status'],
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function toDepartmentTree(rows: DepartmentRow[]): DepartmentTreeNode[] {
  const childrenByParentId = new Map<string | null, DepartmentTreeNode[]>()
  const nodes = rows.map<DepartmentTreeNode>((row) => ({
    ...toDepartment(row),
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
