import {
  BUILT_IN_ADMIN_ROLE_CODE,
  USER_STATUS_ENABLED,
  type UserCreateInput,
  type UserListQuery,
  type UserOptionsQuery,
  type UserUpdateInput,
} from '@rev30/contracts'
import { and, count, desc, eq, gt, ilike, inArray, isNull, or } from 'drizzle-orm'
import type { Db, DbReader } from '../../../db'
import {
  authPasswordCredentials,
  authSessions,
  systemDepartments,
  systemRoles,
  systemUserDepartments,
  systemUserRoles,
  systemUsers,
} from '../../../db/schema'
import type { UserAccess } from '../../auth/access'
import {
  findDepartmentSummariesByUserIds,
  lockActiveDepartmentsByIds,
} from '../departments/repository'
import {
  findRoleAccessScopesByIds,
  findRoleSummariesByUserIds,
  lockActiveRolesByIds,
} from '../roles/repository'
import {
  BuiltInUserMutationError,
  UserInvalidDepartmentError,
  UserInvalidRoleError,
  UserMutationForbiddenError,
} from './errors'
import type { UserOptionEntry } from './mapper'

const userOptionColumns = {
  id: systemUsers.id,
  username: systemUsers.username,
  nickname: systemUsers.nickname,
  status: systemUsers.status,
} satisfies Record<keyof UserOptionEntry, unknown>

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
    return []
  }

  const rows = await lockActiveRolesByIds(executor, ids)

  if (rows.length !== new Set(ids).size) {
    throw new UserInvalidRoleError()
  }

  return rows
}

async function lockActiveUserById(executor: DbReader, id: string) {
  const [user] = await executor
    .select()
    .from(systemUsers)
    .where(and(eq(systemUsers.id, id), isNull(systemUsers.deletedAt)))
    .limit(1)
    .for('update')

  return user
}

async function assertRoleIdsWithinAccessScope(
  executor: DbReader,
  roleIds: string[],
  access: UserAccess,
  forbiddenReason: 'role-assignment' | 'user-access',
) {
  if (access.isAdmin || roleIds.length === 0) {
    return
  }

  const roleScopes = await findRoleAccessScopesByIds(executor, roleIds)
  const allowedCodes = new Set(access.accessCodes)
  const exceedsAccessScope = roleScopes.some(
    (role) =>
      role.code === BUILT_IN_ADMIN_ROLE_CODE ||
      role.resourceCodes.some((resourceCode) => !allowedCodes.has(resourceCode)),
  )

  if (exceedsAccessScope) {
    throw new UserMutationForbiddenError(forbiddenReason)
  }
}

async function assertUserWithinAccessScope(executor: DbReader, userId: string, access: UserAccess) {
  if (access.isAdmin) {
    return
  }

  const roleRows = await executor
    .select({ roleId: systemRoles.id })
    .from(systemUserRoles)
    .innerJoin(systemRoles, eq(systemRoles.id, systemUserRoles.roleId))
    .where(and(eq(systemUserRoles.userId, userId), isNull(systemRoles.deletedAt)))

  await assertRoleIdsWithinAccessScope(
    executor,
    roleRows.map((role) => role.roleId),
    access,
    'user-access',
  )
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

    async create(input: UserCreateInput, passwordHash: string, access: UserAccess) {
      const { departmentIds = [], roleIds = [], ...userInput } = input

      return await database.transaction(async (tx) => {
        await Promise.all([
          lockActiveDepartmentIdsOrThrow(tx, departmentIds),
          lockActiveRoleIdsOrThrow(tx, roleIds),
        ])
        await assertRoleIdsWithinAccessScope(tx, roleIds, access, 'role-assignment')

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

    async resetPassword(id: string, passwordHash: string, access: UserAccess) {
      const now = new Date()

      return await database.transaction(async (tx) => {
        const existingUser = await lockActiveUserById(tx, id)

        if (!existingUser) {
          return undefined
        }

        if (existingUser.builtIn) {
          throw new BuiltInUserMutationError('edit')
        }

        await assertUserWithinAccessScope(tx, id, access)

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
          .update(authSessions)
          .set({
            revokedAt: now,
            revocationReason: 'password_reset',
            updatedAt: now,
          })
          .where(
            and(
              eq(authSessions.userId, id),
              isNull(authSessions.revokedAt),
              gt(authSessions.expiresAt, now),
            ),
          )

        return existingUser
      })
    },

    async update(id: string, input: UserUpdateInput, access: UserAccess) {
      const { departmentIds, roleIds, ...userInput } = input

      return await database.transaction(async (tx) => {
        const existingUser = await lockActiveUserById(tx, id)

        if (!existingUser) {
          return undefined
        }

        if (existingUser.builtIn) {
          throw new BuiltInUserMutationError('edit')
        }

        await assertUserWithinAccessScope(tx, id, access)

        if (departmentIds !== undefined) {
          await lockActiveDepartmentIdsOrThrow(tx, departmentIds)
        }

        if (roleIds !== undefined) {
          await lockActiveRoleIdsOrThrow(tx, roleIds)
          await assertRoleIdsWithinAccessScope(tx, roleIds, access, 'role-assignment')
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

        if (existingUser.status === USER_STATUS_ENABLED && updated.status !== USER_STATUS_ENABLED) {
          const now = new Date()
          await tx
            .update(authSessions)
            .set({ revokedAt: now, revocationReason: 'user_disabled', updatedAt: now })
            .where(
              and(
                eq(authSessions.userId, id),
                isNull(authSessions.revokedAt),
                gt(authSessions.expiresAt, now),
              ),
            )
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

    async softDelete(id: string, access: UserAccess) {
      const now = new Date()

      return await database.transaction(async (tx) => {
        const existingUser = await lockActiveUserById(tx, id)

        if (!existingUser) {
          return undefined
        }

        if (existingUser.builtIn) {
          throw new BuiltInUserMutationError('delete')
        }

        await assertUserWithinAccessScope(tx, id, access)

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

        await tx
          .update(authSessions)
          .set({ revokedAt: now, revocationReason: 'user_deleted', updatedAt: now })
          .where(
            and(
              eq(authSessions.userId, id),
              isNull(authSessions.revokedAt),
              gt(authSessions.expiresAt, now),
            ),
          )

        return deleted
      })
    },
  }
}
