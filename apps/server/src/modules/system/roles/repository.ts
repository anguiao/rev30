import { randomUUID } from 'node:crypto'
import type { RoleCreateInput, RoleListQuery, RoleSummary, RoleUpdateInput } from '@rev30/shared'
import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm'
import type { Db, DbReader } from '../../../db'
import { roleResources, roles, systemResources, userRoles, users } from '../../../db/schema'
import { RoleDeleteConflictError, RoleInvalidResourceError } from './errors'
import type { RoleRow } from './mapper'

function roleSortOrder() {
  return [asc(roles.sortOrder), desc(roles.createdAt), desc(roles.id)] as const
}

async function hasUsers(executor: DbReader, id: string) {
  const rows = await executor
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .where(eq(userRoles.roleId, id))
    .limit(1)

  return rows.length > 0
}

async function lockActiveResourceIdsOrThrow(executor: DbReader, ids: string[]) {
  if (ids.length === 0) {
    return
  }

  const uniqueIds = [...new Set(ids)]
  const rows = await executor
    .select({ id: systemResources.id })
    .from(systemResources)
    .where(and(inArray(systemResources.id, uniqueIds), isNull(systemResources.deletedAt)))
    .for('update')

  if (rows.length !== uniqueIds.length) {
    throw new RoleInvalidResourceError()
  }
}

function buildRoleResourceValues(roleId: string, resourceIds: string[], now: Date) {
  return resourceIds.map((resourceId) => ({
    roleId,
    resourceId,
    createdAt: now,
  }))
}

export async function lockActiveRolesByIds(executor: DbReader, ids: string[]) {
  const rows: RoleRow[] = []
  const sortedIds = [...new Set(ids)].sort()

  for (const id of sortedIds) {
    const [row] = await executor
      .select()
      .from(roles)
      .where(and(eq(roles.id, id), isNull(roles.deletedAt)))
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
      userId: userRoles.userId,
      roleId: roles.id,
      roleName: roles.name,
      roleCode: roles.code,
    })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(inArray(userRoles.userId, userIds), isNull(roles.deletedAt)))
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
        isNull(roles.deletedAt),
        status === undefined ? undefined : eq(roles.status, status),
        keywordFilter
          ? or(ilike(roles.name, keywordFilter), ilike(roles.code, keywordFilter))
          : undefined,
      ]
      const where = and(...filters)

      const roleUserCounts = database
        .select({
          roleId: userRoles.roleId,
          userCount: sql<number>`count(${users.id})::int`.as('user_count'),
        })
        .from(userRoles)
        .innerJoin(users, and(eq(users.id, userRoles.userId), isNull(users.deletedAt)))
        .groupBy(userRoles.roleId)
        .as('role_user_counts')

      const [list, totalRows] = await Promise.all([
        database
          .select({
            role: {
              id: roles.id,
              name: roles.name,
              code: roles.code,
              status: roles.status,
              sortOrder: roles.sortOrder,
              createdAt: roles.createdAt,
              updatedAt: roles.updatedAt,
              deletedAt: roles.deletedAt,
            },
            userCount: sql<number>`coalesce(${roleUserCounts.userCount}, 0)::int`.as('user_count'),
          })
          .from(roles)
          .leftJoin(roleUserCounts, eq(roleUserCounts.roleId, roles.id))
          .where(where)
          .orderBy(...roleSortOrder())
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        database
          .select({
            total: count(),
          })
          .from(roles)
          .where(where),
      ])

      return {
        list,
        total: totalRows[0]?.total ?? 0,
        page,
        pageSize,
      }
    },

    async findActiveById(id: string) {
      const rows = await database
        .select()
        .from(roles)
        .where(and(eq(roles.id, id), isNull(roles.deletedAt)))
        .limit(1)

      return rows[0]
    },

    async findResourcesByRoleId(roleId: string) {
      return await database
        .select({
          id: systemResources.id,
          name: systemResources.name,
          code: systemResources.code,
          type: systemResources.type,
        })
        .from(roleResources)
        .innerJoin(systemResources, eq(systemResources.id, roleResources.resourceId))
        .where(and(eq(roleResources.roleId, roleId), isNull(systemResources.deletedAt)))
        .orderBy(
          asc(systemResources.sortOrder),
          desc(systemResources.createdAt),
          desc(systemResources.id),
        )
    },

    async hasUsers(id: string) {
      return await hasUsers(database, id)
    },

    async create(input: RoleCreateInput) {
      const now = new Date()
      const { resourceIds = [], ...roleInput } = input

      return await database.transaction(async (tx) => {
        await lockActiveResourceIdsOrThrow(tx, resourceIds)

        const [created] = await tx
          .insert(roles)
          .values({
            id: randomUUID(),
            ...roleInput,
            createdAt: now,
            updatedAt: now,
          })
          .returning()

        if (!created) {
          throw new Error('创建角色失败')
        }

        if (resourceIds.length > 0) {
          await tx
            .insert(roleResources)
            .values(buildRoleResourceValues(created.id, resourceIds, now))
        }

        return created
      })
    },

    async update(id: string, input: RoleUpdateInput) {
      const { resourceIds, ...roleInput } = input

      return await database.transaction(async (tx) => {
        if (resourceIds !== undefined) {
          await lockActiveResourceIdsOrThrow(tx, resourceIds)
        }

        const [updated] = await tx
          .update(roles)
          .set({
            ...roleInput,
            updatedAt: new Date(),
          })
          .where(and(eq(roles.id, id), isNull(roles.deletedAt)))
          .returning()

        if (!updated) {
          return undefined
        }

        if (resourceIds !== undefined) {
          await tx.delete(roleResources).where(eq(roleResources.roleId, id))

          if (resourceIds.length > 0) {
            await tx
              .insert(roleResources)
              .values(buildRoleResourceValues(updated.id, resourceIds, new Date()))
          }
        }

        return updated
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

        await tx.delete(roleResources).where(eq(roleResources.roleId, id))

        const [deleted] = await tx
          .update(roles)
          .set({
            deletedAt: now,
            updatedAt: now,
          })
          .where(and(eq(roles.id, id), isNull(roles.deletedAt)))
          .returning()

        return deleted
      })
    },
  }
}
