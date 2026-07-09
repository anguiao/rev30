import type { Role, RoleListItem, RoleOption, RoleResource, RoleSummary } from '@rev30/contracts'
import { toIsoDateTime } from '@rev30/utils'
import { systemRoles } from '../../../db/schema'

export type RoleRow = typeof systemRoles.$inferSelect
export type RoleOptionEntry = Pick<RoleRow, keyof RoleOption>
export type RoleListEntry = {
  role: RoleRow
  userCount: number
}
export type RoleResourceEntry = {
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

export function toRoleListItem(entry: RoleListEntry): RoleListItem {
  const { role, userCount } = entry

  return {
    ...toRoleSummary(role),
    status: role.status as Role['status'],
    sortOrder: role.sortOrder,
    userCount,
    createdAt: toIsoDateTime(role.createdAt),
    updatedAt: toIsoDateTime(role.updatedAt),
  }
}

export function toRole(row: RoleRow, resources: RoleResource[]): Role {
  return {
    ...toRoleSummary(row),
    status: row.status as Role['status'],
    sortOrder: row.sortOrder,
    resources,
    createdAt: toIsoDateTime(row.createdAt),
    updatedAt: toIsoDateTime(row.updatedAt),
  }
}

export function toRoleOption(entry: RoleOptionEntry): RoleOption {
  return {
    id: entry.id,
    name: entry.name,
    code: entry.code,
    status: entry.status as RoleOption['status'],
  }
}

export function toRoleResource(entry: RoleResourceEntry): RoleResource {
  return {
    id: entry.id,
    name: entry.name,
    code: entry.code,
    type: entry.type as RoleResource['type'],
  }
}

export function toRoleResources(entries: RoleResourceEntry[]): RoleResource[] {
  return entries.map(toRoleResource)
}
