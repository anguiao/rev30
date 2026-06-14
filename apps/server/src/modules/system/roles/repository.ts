import {
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
import {
  RoleDeleteConflictError,
  RoleInvalidResourceError,
  RoleInvalidResourceAssignmentError,
} from './errors'
import type { RoleOptionRow, RoleResourceRow, RoleRow } from './mapper'

const roleOptionColumns = {
  id: systemRoles.id,
  name: systemRoles.name,
  code: systemRoles.code,
  status: systemRoles.status,
} satisfies Record<keyof RoleOptionRow, unknown>

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
    return
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
): Promise<RoleResourceRow[]> {
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

    async hasUsers(id: string) {
      return await hasUsers(database, id)
    },

    async create(input: RoleCreateInput) {
      const { resourceIds = [], ...roleInput } = input

      return await database.transaction(async (tx) => {
        await lockValidResourceIdsOrThrow(tx, resourceIds)

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

    async update(id: string, input: RoleUpdateInput) {
      const { resourceIds, ...roleInput } = input

      return await database.transaction(async (tx) => {
        if (resourceIds !== undefined) {
          await lockValidResourceIdsOrThrow(tx, resourceIds)
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

    async softDelete(id: string) {
      const now = new Date()

      return await database.transaction(async (tx) => {
        const role = await lockActiveRoleById(tx, id)

        if (!role) {
          return undefined
        }

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
