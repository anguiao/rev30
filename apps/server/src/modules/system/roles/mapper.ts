import type { Role, RoleListItem, RoleOption, RoleResource, RoleSummary } from '@rev30/shared'
import { systemRoles } from '../../../db/schema'

export type RoleRow = typeof systemRoles.$inferSelect
export type RoleOptionRow = Pick<RoleRow, keyof RoleOption>
export type RoleResourceRow = {
  id: string
  name: string
  code: string
  type: string
}

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

export function toRoleOption(row: RoleOptionRow): RoleOption {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    status: row.status as RoleOption['status'],
  }
}

export function toRoleResource(row: RoleResourceRow): RoleResource {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    type: row.type as RoleResource['type'],
  }
}

export function toRoleResources(rows: RoleResourceRow[]): RoleResource[] {
  return rows.map(toRoleResource)
}
