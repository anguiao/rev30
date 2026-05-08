import { arrayToTree, type Department, type DepartmentTreeNode } from '@rev30/shared'
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
  return arrayToTree(rows.map(toDepartment))
}
