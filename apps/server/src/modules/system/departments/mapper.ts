import type { Department, DepartmentTreeNode, DepartmentTreeOption } from '@rev30/contracts'
import { arrayToTree } from '@rev30/utils'
import { systemDepartments } from '../../../db/schema'

export type DepartmentRow = typeof systemDepartments.$inferSelect
export type DepartmentTreeOptionRow = Pick<
  DepartmentRow,
  keyof Omit<DepartmentTreeOption, 'children'>
>

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

export function toDepartmentTreeOption(row: DepartmentTreeOptionRow): DepartmentTreeOption {
  return {
    id: row.id,
    parentId: row.parentId,
    name: row.name,
    code: row.code,
    status: row.status as DepartmentTreeOption['status'],
    children: [],
  }
}

export function toDepartmentTreeOptions(rows: DepartmentTreeOptionRow[]): DepartmentTreeOption[] {
  return arrayToTree(rows.map(toDepartmentTreeOption))
}
