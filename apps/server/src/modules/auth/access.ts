import {
  RESOURCE_STATUS_ENABLED,
  RESOURCE_TYPE_ACTION,
  ROLE_STATUS_ENABLED,
  type AuthSessionResponse,
  type Resource,
  type ResourceTreeNode,
} from '@rev30/contracts'
import { and, asc, desc, eq, getTableColumns, isNull } from 'drizzle-orm'
import type { Db } from '../../db'
import { systemRoleResources, systemRoles, systemResources, systemUserRoles } from '../../db/schema'
import { toResourceTree, type ResourceRow } from '../system/resources/mapper'

export type ResolvedUserAccess = Pick<AuthSessionResponse, 'accessCodes' | 'menus'> & {
  isAdmin: boolean
}

function resourceOrder() {
  return [
    asc(systemResources.sortOrder),
    desc(systemResources.createdAt),
    desc(systemResources.id),
  ] as const
}

function isMenuResource(resource: Resource) {
  return resource.type !== RESOURCE_TYPE_ACTION
}

function filterMenuNodes(nodes: ResourceTreeNode[]): ResourceTreeNode[] {
  return nodes
    .filter(isMenuResource)
    .map((node) => ({ ...node, children: filterMenuNodes(node.children) }))
}

export function createUserAccessService(database: Db) {
  async function findActiveRoles(userId: string) {
    return await database
      .select({
        id: systemRoles.id,
        code: systemRoles.code,
      })
      .from(systemUserRoles)
      .innerJoin(systemRoles, eq(systemRoles.id, systemUserRoles.roleId))
      .where(
        and(
          eq(systemUserRoles.userId, userId),
          eq(systemRoles.status, ROLE_STATUS_ENABLED),
          isNull(systemRoles.deletedAt),
        ),
      )
  }

  async function listEnabledResourcesForAdmin() {
    const rows = await database
      .select()
      .from(systemResources)
      .where(
        and(eq(systemResources.status, RESOURCE_STATUS_ENABLED), isNull(systemResources.deletedAt)),
      )
      .orderBy(...resourceOrder())

    return rows
  }

  async function listEnabledResourcesForUser(userId: string) {
    const rows = await database
      .select(getTableColumns(systemResources))
      .from(systemUserRoles)
      .innerJoin(systemRoles, eq(systemRoles.id, systemUserRoles.roleId))
      .innerJoin(systemRoleResources, eq(systemRoleResources.roleId, systemRoles.id))
      .innerJoin(systemResources, eq(systemResources.id, systemRoleResources.resourceId))
      .where(
        and(
          eq(systemUserRoles.userId, userId),
          eq(systemRoles.status, ROLE_STATUS_ENABLED),
          isNull(systemRoles.deletedAt),
          eq(systemResources.status, RESOURCE_STATUS_ENABLED),
          isNull(systemResources.deletedAt),
        ),
      )
      .orderBy(...resourceOrder())

    return rows
  }

  return {
    async resolveUserAccess(userId: string): Promise<ResolvedUserAccess> {
      const activeRoles = await findActiveRoles(userId)
      const isAdmin = activeRoles.some((role) => role.code === 'admin')
      const resourceRows = isAdmin
        ? await listEnabledResourcesForAdmin()
        : await listEnabledResourcesForUser(userId)

      const uniqueRowsByCode = new Map<string, ResourceRow>()
      for (const row of resourceRows) {
        if (!uniqueRowsByCode.has(row.code)) {
          uniqueRowsByCode.set(row.code, row)
        }
      }

      const rows = [...uniqueRowsByCode.values()]
      const accessCodes = rows.map((row) => row.code)
      const menus = filterMenuNodes(toResourceTree(rows))

      return {
        accessCodes,
        menus,
        isAdmin,
      }
    },
  }
}
