import type { Role, RoleListItem, RoleResource, RoleSummary } from '@rev30/shared'
import { roles } from '../../../db/schema'

export type RoleRow = typeof roles.$inferSelect

export function toRoleSummary(row: RoleRow): RoleSummary {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
  }
}

export function toRoleListItem(row: RoleRow & { userCount: number }): RoleListItem {
  return {
    ...toRoleSummary(row),
    status: row.status as Role['status'],
    sortOrder: row.sortOrder,
    userCount: row.userCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function toRole(row: RoleRow, resources: RoleResource[]): Role {
  return {
    ...toRoleSummary(row),
    status: row.status as Role['status'],
    sortOrder: row.sortOrder,
    resources,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
