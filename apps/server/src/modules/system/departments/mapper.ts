import type { Department, DepartmentTreeNode, DepartmentTreeOption } from '@rev30/contracts'
import { arrayToTree, toIsoDateTime } from '@rev30/utils'
import { systemDepartments } from '../../../db/schema'

export type DepartmentRow = typeof systemDepartments.$inferSelect
export type DepartmentTreeOptionEntry = Pick<
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
    createdAt: toIsoDateTime(row.createdAt),
    updatedAt: toIsoDateTime(row.updatedAt),
  }
}

export function toDepartmentTree(rows: DepartmentRow[]): DepartmentTreeNode[] {
  return arrayToTree(rows.map(toDepartment))
}

export function toDepartmentTreeOption(entry: DepartmentTreeOptionEntry): DepartmentTreeOption {
  return {
    id: entry.id,
    parentId: entry.parentId,
    name: entry.name,
    code: entry.code,
    status: entry.status as DepartmentTreeOption['status'],
    children: [],
  }
}

export function toDepartmentTreeOptions(
  entries: DepartmentTreeOptionEntry[],
): DepartmentTreeOption[] {
  return arrayToTree(entries.map(toDepartmentTreeOption))
}
