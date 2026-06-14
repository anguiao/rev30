import {
  USER_STATUS_ENABLED,
  type UserCreateInput,
  type UserListQuery,
  type UserOptionsQuery,
  type UserUpdateInput,
} from '@rev30/contracts'
import { and, count, desc, eq, ilike, inArray, isNull, or } from 'drizzle-orm'
import type { Db, DbReader } from '../../../db'
import {
  authPasswordCredentials,
  authRefreshTokens,
  systemDepartments,
  systemRoles,
  systemUserDepartments,
  systemUserRoles,
  systemUsers,
} from '../../../db/schema'
import {
  findDepartmentSummariesByUserIds,
  lockActiveDepartmentsByIds,
} from '../departments/repository'
import { findRoleSummariesByUserIds, lockActiveRolesByIds } from '../roles/repository'
import { UserInvalidDepartmentError, UserInvalidRoleError } from './errors'
import type { UserOptionRow } from './mapper'

const userOptionColumns = {
  id: systemUsers.id,
  username: systemUsers.username,
  nickname: systemUsers.nickname,
  status: systemUsers.status,
} satisfies Record<keyof UserOptionRow, unknown>

function buildUserDepartmentValues(userId: string, departmentIds: string[]) {
  return departmentIds.map((departmentId) => ({
    userId,
    departmentId,
  }))
}

function buildUserRoleValues(userId: string, roleIds: string[]) {
  return roleIds.map((roleId) => ({
    userId,
    roleId,
  }))
}

async function lockActiveDepartmentIdsOrThrow(executor: DbReader, ids: string[]) {
  if (ids.length === 0) {
    return
  }

  const rows = await lockActiveDepartmentsByIds(executor, ids)

  if (rows.length !== new Set(ids).size) {
    throw new UserInvalidDepartmentError()
  }
}

async function lockActiveRoleIdsOrThrow(executor: DbReader, ids: string[]) {
  if (ids.length === 0) {
    return
  }

  const rows = await lockActiveRolesByIds(executor, ids)

  if (rows.length !== new Set(ids).size) {
    throw new UserInvalidRoleError()
  }
}

export function createUserRepository(database: Db) {
  return {
    async list(query: UserListQuery) {
      const { page, pageSize, keyword, status, departmentId, roleId } = query
      const keywordFilter = keyword ? `%${keyword}%` : undefined
      const departmentUserIds =
        departmentId === undefined
          ? undefined
          : database
              .select({ userId: systemUserDepartments.userId })
              .from(systemUserDepartments)
              .innerJoin(
                systemDepartments,
                eq(systemDepartments.id, systemUserDepartments.departmentId),
              )
              .where(
                and(
                  eq(systemUserDepartments.departmentId, departmentId),
                  isNull(systemDepartments.deletedAt),
                ),
              )
      const roleUserIds =
        roleId === undefined
          ? undefined
          : database
              .select({ userId: systemUserRoles.userId })
              .from(systemUserRoles)
              .innerJoin(systemRoles, eq(systemRoles.id, systemUserRoles.roleId))
              .where(and(eq(systemUserRoles.roleId, roleId), isNull(systemRoles.deletedAt)))
      const filters = [
        isNull(systemUsers.deletedAt),
        status === undefined ? undefined : eq(systemUsers.status, status),
        departmentUserIds === undefined ? undefined : inArray(systemUsers.id, departmentUserIds),
        roleUserIds === undefined ? undefined : inArray(systemUsers.id, roleUserIds),
        keywordFilter
          ? or(
              ilike(systemUsers.username, keywordFilter),
              ilike(systemUsers.nickname, keywordFilter),
              ilike(systemUsers.email, keywordFilter),
              ilike(systemUsers.phone, keywordFilter),
            )
          : undefined,
      ]
      const where = and(...filters)

      const [list, totalRows] = await Promise.all([
        database
          .select()
          .from(systemUsers)
          .where(where)
          .orderBy(desc(systemUsers.createdAt), desc(systemUsers.id))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        database
          .select({
            total: count(),
          })
          .from(systemUsers)
          .where(where),
      ])

      const userIds = list.map((user) => user.id)
      const [departmentSummaries, roleSummaries] = await Promise.all([
        findDepartmentSummariesByUserIds(database, userIds),
        findRoleSummariesByUserIds(database, userIds),
      ])

      return {
        list: list.map((user) => ({
          user,
          departments: departmentSummaries.get(user.id) ?? [],
          roles: roleSummaries.get(user.id) ?? [],
        })),
        total: totalRows[0]?.total ?? 0,
        page,
        pageSize,
      }
    },

    async options(query: UserOptionsQuery) {
      const filters = [
        isNull(systemUsers.deletedAt),
        query.includeIds.length > 0
          ? or(
              eq(systemUsers.status, USER_STATUS_ENABLED),
              inArray(systemUsers.id, query.includeIds),
            )
          : eq(systemUsers.status, USER_STATUS_ENABLED),
      ]

      return await database
        .select(userOptionColumns)
        .from(systemUsers)
        .where(and(...filters))
        .orderBy(desc(systemUsers.createdAt), desc(systemUsers.id))
    },

    async findActiveById(id: string) {
      const rows = await database
        .select()
        .from(systemUsers)
        .where(and(eq(systemUsers.id, id), isNull(systemUsers.deletedAt)))
        .limit(1)

      const user = rows[0]

      if (!user) {
        return undefined
      }

      const [departmentSummaries, roleSummaries] = await Promise.all([
        findDepartmentSummariesByUserIds(database, [id]),
        findRoleSummariesByUserIds(database, [id]),
      ])

      return {
        user,
        departments: departmentSummaries.get(id) ?? [],
        roles: roleSummaries.get(id) ?? [],
      }
    },

    async create(input: UserCreateInput, passwordHash: string) {
      const { departmentIds = [], roleIds = [], ...userInput } = input

      return await database.transaction(async (tx) => {
        await Promise.all([
          lockActiveDepartmentIdsOrThrow(tx, departmentIds),
          lockActiveRoleIdsOrThrow(tx, roleIds),
        ])

        const [created] = await tx.insert(systemUsers).values(userInput).returning()

        if (!created) {
          throw new Error('创建用户失败')
        }

        await tx.insert(authPasswordCredentials).values({
          userId: created.id,
          passwordHash,
          mustChangePassword: true,
        })

        if (departmentIds.length > 0) {
          await tx
            .insert(systemUserDepartments)
            .values(buildUserDepartmentValues(created.id, departmentIds))
        }

        if (roleIds.length > 0) {
          await tx.insert(systemUserRoles).values(buildUserRoleValues(created.id, roleIds))
        }

        const [departmentSummaries, roleSummaries] = await Promise.all([
          findDepartmentSummariesByUserIds(tx, [created.id]),
          findRoleSummariesByUserIds(tx, [created.id]),
        ])

        return {
          user: created,
          departments: departmentSummaries.get(created.id) ?? [],
          roles: roleSummaries.get(created.id) ?? [],
        }
      })
    },

    async resetPassword(id: string, passwordHash: string) {
      const now = new Date()

      return await database.transaction(async (tx) => {
        const existingRows = await tx
          .select()
          .from(systemUsers)
          .where(and(eq(systemUsers.id, id), isNull(systemUsers.deletedAt)))
          .limit(1)
        const existingUser = existingRows[0]

        if (!existingUser) {
          return undefined
        }

        await tx
          .insert(authPasswordCredentials)
          .values({
            userId: id,
            passwordHash,
            mustChangePassword: true,
          })
          .onConflictDoUpdate({
            target: authPasswordCredentials.userId,
            set: {
              passwordHash,
              mustChangePassword: true,
              updatedAt: now,
            },
          })

        await tx
          .update(authRefreshTokens)
          .set({
            revokedAt: now,
          })
          .where(and(eq(authRefreshTokens.userId, id), isNull(authRefreshTokens.revokedAt)))

        return existingUser
      })
    },

    async update(id: string, input: UserUpdateInput) {
      const { departmentIds, roleIds, ...userInput } = input

      return await database.transaction(async (tx) => {
        const existingRows = await tx
          .select()
          .from(systemUsers)
          .where(and(eq(systemUsers.id, id), isNull(systemUsers.deletedAt)))
          .limit(1)
        const existingUser = existingRows[0]

        if (!existingUser) {
          return undefined
        }

        if (departmentIds !== undefined) {
          await lockActiveDepartmentIdsOrThrow(tx, departmentIds)
        }

        if (roleIds !== undefined) {
          await lockActiveRoleIdsOrThrow(tx, roleIds)
        }

        const userUpdateValues = Object.values(userInput).some((value) => value !== undefined)
          ? userInput
          : { updatedAt: new Date() }
        const [updated] = await tx
          .update(systemUsers)
          .set(userUpdateValues)
          .where(and(eq(systemUsers.id, id), isNull(systemUsers.deletedAt)))
          .returning()

        if (!updated) {
          return undefined
        }

        if (departmentIds !== undefined) {
          await tx.delete(systemUserDepartments).where(eq(systemUserDepartments.userId, id))

          if (departmentIds.length > 0) {
            await tx
              .insert(systemUserDepartments)
              .values(buildUserDepartmentValues(updated.id, departmentIds))
          }
        }

        if (roleIds !== undefined) {
          await tx.delete(systemUserRoles).where(eq(systemUserRoles.userId, id))

          if (roleIds.length > 0) {
            await tx.insert(systemUserRoles).values(buildUserRoleValues(updated.id, roleIds))
          }
        }

        const [departmentSummaries, roleSummaries] = await Promise.all([
          findDepartmentSummariesByUserIds(tx, [updated.id]),
          findRoleSummariesByUserIds(tx, [updated.id]),
        ])

        return {
          user: updated,
          departments: departmentSummaries.get(updated.id) ?? [],
          roles: roleSummaries.get(updated.id) ?? [],
        }
      })
    },

    async softDelete(id: string) {
      const now = new Date()

      return await database.transaction(async (tx) => {
        const [deleted] = await tx
          .update(systemUsers)
          .set({
            deletedAt: now,
            updatedAt: now,
          })
          .where(and(eq(systemUsers.id, id), isNull(systemUsers.deletedAt)))
          .returning()

        if (!deleted) {
          return undefined
        }

        await tx.delete(systemUserDepartments).where(eq(systemUserDepartments.userId, id))
        await tx.delete(systemUserRoles).where(eq(systemUserRoles.userId, id))

        return deleted
      })
    },
  }
}
