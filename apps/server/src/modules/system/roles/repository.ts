import {
  BUILT_IN_ADMIN_ROLE_CODE,
  ROLE_STATUS_ENABLED,
  type RoleCreateInput,
  type RoleListQuery,
  type RoleOptionsQuery,
  createRoleResourceIdsSchema,
  type RoleSummary,
  type RoleUpdateInput,
} from '@rev30/contracts'
import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Db, DbReader } from '../../../db'
import {
  systemRoleResources,
  systemRoles,
  systemResources,
  systemUserRoles,
  systemUsers,
} from '../../../db/schema'
import type { UserAccess } from '../../auth/access'
import {
  BuiltInAdminRoleMutationError,
  RoleDeleteConflictError,
  RoleInvalidResourceError,
  RoleInvalidResourceAssignmentError,
  RoleMutationForbiddenError,
} from './errors'
import type { RoleOptionEntry, RoleResourceEntry, RoleRow } from './mapper'

const roleOptionColumns = {
  id: systemRoles.id,
  name: systemRoles.name,
  code: systemRoles.code,
  status: systemRoles.status,
} satisfies Record<keyof RoleOptionEntry, unknown>

function roleSortOrder() {
  return [asc(systemRoles.sortOrder), desc(systemRoles.createdAt), desc(systemRoles.id)] as const
}

async function hasUsers(executor: DbReader, id: string) {
  const rows = await executor
    .select({ userId: systemUserRoles.userId })
    .from(systemUserRoles)
    .where(eq(systemUserRoles.roleId, id))
    .limit(1)

  return rows.length > 0
}

async function lockActiveResourcesByIds(executor: DbReader, ids: string[]) {
  const rows: Array<typeof systemResources.$inferSelect> = []
  const sortedIds = [...new Set(ids)].sort()

  for (const id of sortedIds) {
    const [row] = await executor
      .select()
      .from(systemResources)
      .where(and(eq(systemResources.id, id), isNull(systemResources.deletedAt)))
      .limit(1)
      .for('update')

    if (row) {
      rows.push(row)
    }
  }

  return rows
}

async function lockValidResourceIdsOrThrow(executor: DbReader, ids: string[]) {
  if (ids.length === 0) {
    return []
  }

  const uniqueIds = [...new Set(ids)]
  const rows = await lockActiveResourcesByIds(executor, ids)

  if (rows.length !== uniqueIds.length) {
    throw new RoleInvalidResourceError()
  }

  const resourceIdsResult = createRoleResourceIdsSchema(rows).safeParse(uniqueIds)

  if (!resourceIdsResult.success) {
    const { formErrors } = z.flattenError(resourceIdsResult.error)
    throw new RoleInvalidResourceAssignmentError(formErrors.join('，'))
  }

  return rows
}

function buildRoleResourceValues(roleId: string, resourceIds: string[]) {
  return resourceIds.map((resourceId) => ({
    roleId,
    resourceId,
  }))
}

async function findResourcesByRoleId(
  executor: DbReader,
  roleId: string,
): Promise<RoleResourceEntry[]> {
  return await executor
    .select({
      id: systemResources.id,
      name: systemResources.name,
      code: systemResources.code,
      type: systemResources.type,
    })
    .from(systemRoleResources)
    .innerJoin(systemResources, eq(systemResources.id, systemRoleResources.resourceId))
    .where(and(eq(systemRoleResources.roleId, roleId), isNull(systemResources.deletedAt)))
    .orderBy(
      asc(systemResources.sortOrder),
      desc(systemResources.createdAt),
      desc(systemResources.id),
    )
}

export async function findRoleAccessScopesByIds(executor: DbReader, ids: string[]) {
  if (ids.length === 0) {
    return []
  }

  const roles = await executor
    .select({
      id: systemRoles.id,
      code: systemRoles.code,
    })
    .from(systemRoles)
    .where(and(inArray(systemRoles.id, ids), isNull(systemRoles.deletedAt)))
  const resources = await executor
    .select({
      roleId: systemRoleResources.roleId,
      code: systemResources.code,
    })
    .from(systemRoleResources)
    .innerJoin(systemResources, eq(systemResources.id, systemRoleResources.resourceId))
    .where(and(inArray(systemRoleResources.roleId, ids), isNull(systemResources.deletedAt)))
  const resourceCodesByRoleId = new Map<string, string[]>()

  for (const resource of resources) {
    const codes = resourceCodesByRoleId.get(resource.roleId) ?? []
    codes.push(resource.code)
    resourceCodesByRoleId.set(resource.roleId, codes)
  }

  return roles.map((role) => ({
    ...role,
    resourceCodes: resourceCodesByRoleId.get(role.id) ?? [],
  }))
}

export async function lockActiveRolesByIds(executor: DbReader, ids: string[]) {
  const rows: RoleRow[] = []
  const sortedIds = [...new Set(ids)].sort()

  for (const id of sortedIds) {
    const [row] = await executor
      .select()
      .from(systemRoles)
      .where(and(eq(systemRoles.id, id), isNull(systemRoles.deletedAt)))
      .limit(1)
      .for('update')

    if (row) {
      rows.push(row)
    }
  }

  return rows
}

export async function findRoleSummariesByUserIds(executor: DbReader, userIds: string[]) {
  const summariesByUserId = new Map<string, RoleSummary[]>()

  if (userIds.length === 0) {
    return summariesByUserId
  }

  const rows = await executor
    .select({
      userId: systemUserRoles.userId,
      roleId: systemRoles.id,
      roleName: systemRoles.name,
      roleCode: systemRoles.code,
    })
    .from(systemUserRoles)
    .innerJoin(systemRoles, eq(systemRoles.id, systemUserRoles.roleId))
    .where(and(inArray(systemUserRoles.userId, userIds), isNull(systemRoles.deletedAt)))
    .orderBy(...roleSortOrder())

  for (const row of rows) {
    const existingSummaries = summariesByUserId.get(row.userId) ?? []
    existingSummaries.push({
      id: row.roleId,
      name: row.roleName,
      code: row.roleCode,
    })
    summariesByUserId.set(row.userId, existingSummaries)
  }

  return summariesByUserId
}

export async function findRoleSummariesByUserId(executor: DbReader, userId: string) {
  const summariesByUserId = await findRoleSummariesByUserIds(executor, [userId])

  return summariesByUserId.get(userId) ?? []
}

async function lockActiveRoleById(executor: DbReader, id: string) {
  const rows = await lockActiveRolesByIds(executor, [id])

  return rows[0]
}

function assertRoleWithinAccessScope(
  roleCode: string,
  resources: readonly Pick<typeof systemResources.$inferSelect, 'code'>[],
  access: UserAccess,
) {
  if (access.isAdmin) {
    return
  }

  const allowedCodes = new Set(access.accessCodes)

  if (
    roleCode === BUILT_IN_ADMIN_ROLE_CODE ||
    resources.some((resource) => !allowedCodes.has(resource.code))
  ) {
    throw new RoleMutationForbiddenError()
  }
}

export function createRoleRepository(database: Db) {
  return {
    async list(query: RoleListQuery) {
      const { page, pageSize, keyword, status } = query
      const keywordFilter = keyword ? `%${keyword}%` : undefined
      const filters = [
        isNull(systemRoles.deletedAt),
        status === undefined ? undefined : eq(systemRoles.status, status),
        keywordFilter
          ? or(ilike(systemRoles.name, keywordFilter), ilike(systemRoles.code, keywordFilter))
          : undefined,
      ]
      const where = and(...filters)

      const roleUserCounts = database
        .select({
          roleId: systemUserRoles.roleId,
          userCount: sql<number>`count(${systemUsers.id})::int`.as('user_count'),
        })
        .from(systemUserRoles)
        .innerJoin(
          systemUsers,
          and(eq(systemUsers.id, systemUserRoles.userId), isNull(systemUsers.deletedAt)),
        )
        .groupBy(systemUserRoles.roleId)
        .as('role_user_counts')

      const [list, totalRows] = await Promise.all([
        database
          .select({
            role: {
              id: systemRoles.id,
              name: systemRoles.name,
              code: systemRoles.code,
              status: systemRoles.status,
              sortOrder: systemRoles.sortOrder,
              createdAt: systemRoles.createdAt,
              updatedAt: systemRoles.updatedAt,
              deletedAt: systemRoles.deletedAt,
            },
            userCount: sql<number>`coalesce(${roleUserCounts.userCount}, 0)::int`.as('user_count'),
          })
          .from(systemRoles)
          .leftJoin(roleUserCounts, eq(roleUserCounts.roleId, systemRoles.id))
          .where(where)
          .orderBy(...roleSortOrder())
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        database
          .select({
            total: count(),
          })
          .from(systemRoles)
          .where(where),
      ])

      return {
        list,
        total: totalRows[0]?.total ?? 0,
        page,
        pageSize,
      }
    },

    async options(query: RoleOptionsQuery) {
      const filters = [
        isNull(systemRoles.deletedAt),
        query.includeIds.length > 0
          ? or(
              eq(systemRoles.status, ROLE_STATUS_ENABLED),
              inArray(systemRoles.id, query.includeIds),
            )
          : eq(systemRoles.status, ROLE_STATUS_ENABLED),
      ]

      return await database
        .select(roleOptionColumns)
        .from(systemRoles)
        .where(and(...filters))
        .orderBy(...roleSortOrder())
    },

    async findActiveById(id: string) {
      const rows = await database
        .select()
        .from(systemRoles)
        .where(and(eq(systemRoles.id, id), isNull(systemRoles.deletedAt)))
        .limit(1)

      return rows[0]
    },

    async findResourcesByRoleId(roleId: string) {
      return await findResourcesByRoleId(database, roleId)
    },

    async create(input: RoleCreateInput, access: UserAccess) {
      const { resourceIds = [], ...roleInput } = input

      return await database.transaction(async (tx) => {
        const resources = await lockValidResourceIdsOrThrow(tx, resourceIds)
        assertRoleWithinAccessScope(input.code, resources, access)

        const [created] = await tx.insert(systemRoles).values(roleInput).returning()

        if (!created) {
          throw new Error('创建角色失败')
        }

        if (resourceIds.length > 0) {
          await tx
            .insert(systemRoleResources)
            .values(buildRoleResourceValues(created.id, resourceIds))
        }

        return {
          role: created,
          resources: await findResourcesByRoleId(tx, created.id),
        }
      })
    },

    async update(id: string, input: RoleUpdateInput, access: UserAccess) {
      const { resourceIds, ...roleInput } = input

      return await database.transaction(async (tx) => {
        const existingRole = await lockActiveRoleById(tx, id)

        if (!existingRole) {
          return undefined
        }

        if (existingRole.code === BUILT_IN_ADMIN_ROLE_CODE) {
          throw new BuiltInAdminRoleMutationError('edit')
        }

        const existingResources = await findResourcesByRoleId(tx, id)
        assertRoleWithinAccessScope(existingRole.code, existingResources, access)
        assertRoleWithinAccessScope(input.code ?? existingRole.code, [], access)

        if (resourceIds !== undefined) {
          const resources = await lockValidResourceIdsOrThrow(tx, resourceIds)
          assertRoleWithinAccessScope(input.code ?? existingRole.code, resources, access)
        }

        const roleUpdateValues = Object.values(roleInput).some((value) => value !== undefined)
          ? roleInput
          : { updatedAt: new Date() }
        const [updated] = await tx
          .update(systemRoles)
          .set(roleUpdateValues)
          .where(and(eq(systemRoles.id, id), isNull(systemRoles.deletedAt)))
          .returning()

        if (!updated) {
          return undefined
        }

        if (resourceIds !== undefined) {
          await tx.delete(systemRoleResources).where(eq(systemRoleResources.roleId, id))

          if (resourceIds.length > 0) {
            await tx
              .insert(systemRoleResources)
              .values(buildRoleResourceValues(updated.id, resourceIds))
          }
        }

        return {
          role: updated,
          resources: await findResourcesByRoleId(tx, updated.id),
        }
      })
    },

    async softDelete(id: string, access: UserAccess) {
      const now = new Date()

      return await database.transaction(async (tx) => {
        const role = await lockActiveRoleById(tx, id)

        if (!role) {
          return undefined
        }

        if (role.code === BUILT_IN_ADMIN_ROLE_CODE) {
          throw new BuiltInAdminRoleMutationError('delete')
        }

        const resources = await findResourcesByRoleId(tx, id)
        assertRoleWithinAccessScope(role.code, resources, access)

        if (await hasUsers(tx, id)) {
          throw new RoleDeleteConflictError()
        }

        await tx.delete(systemRoleResources).where(eq(systemRoleResources.roleId, id))

        const [deleted] = await tx
          .update(systemRoles)
          .set({
            deletedAt: now,
            updatedAt: now,
          })
          .where(and(eq(systemRoles.id, id), isNull(systemRoles.deletedAt)))
          .returning()

        return deleted
      })
    },
  }
}
