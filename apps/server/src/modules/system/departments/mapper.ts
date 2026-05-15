import {
  arrayToTree,
  type Department,
  type DepartmentTreeNode,
  type DepartmentTreeOption,
} from '@rev30/shared'
import { systemDepartments } from '../../../db/schema'

export type DepartmentRow = typeof systemDepartments.$inferSelect

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

export function toDepartmentTreeOption(row: DepartmentRow): DepartmentTreeOption {
  return {
    id: row.id,
    parentId: row.parentId,
    name: row.name,
    code: row.code,
    status: row.status as DepartmentTreeOption['status'],
    children: [],
  }
}

export function toDepartmentTreeOptions(rows: DepartmentRow[]): DepartmentTreeOption[] {
  return arrayToTree(rows.map(toDepartmentTreeOption))
}
