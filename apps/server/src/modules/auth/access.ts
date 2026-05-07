import {
  RESOURCE_STATUS_ENABLED,
  RESOURCE_TYPE_ACTION,
  ROLE_STATUS_ENABLED,
  type AuthSessionResponse,
  type Resource,
  type ResourceTreeNode,
} from '@rev30/shared'
import { and, asc, desc, eq, getTableColumns, isNull } from 'drizzle-orm'
import type { Db } from '../../db'
import { roleResources, roles, systemResources, userRoles } from '../../db/schema'
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

function isVisibleMenuResource(resource: Resource) {
  return resource.type !== RESOURCE_TYPE_ACTION && !resource.hidden
}

function filterMenuNodes(nodes: ResourceTreeNode[]): ResourceTreeNode[] {
  return nodes
    .filter(isVisibleMenuResource)
    .map((node) => ({ ...node, children: filterMenuNodes(node.children) }))
}

export function createUserAccessService(database: Db) {
  async function findActiveRoles(userId: string) {
    return await database
      .select({
        id: roles.id,
        code: roles.code,
      })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(
        and(
          eq(userRoles.userId, userId),
          eq(roles.status, ROLE_STATUS_ENABLED),
          isNull(roles.deletedAt),
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
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .innerJoin(roleResources, eq(roleResources.roleId, roles.id))
      .innerJoin(systemResources, eq(systemResources.id, roleResources.resourceId))
      .where(
        and(
          eq(userRoles.userId, userId),
          eq(roles.status, ROLE_STATUS_ENABLED),
          isNull(roles.deletedAt),
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
