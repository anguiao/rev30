import { randomUUID } from 'node:crypto'
import type {
  DepartmentSummary,
  UserCreateInput,
  UserListQuery,
  UserUpdateInput,
} from '@rev30/shared'
import { and, count, desc, eq, ilike, isNull, or } from 'drizzle-orm'
import type { Db, DbReader } from '../../../db'
import { userDepartments, users } from '../../../db/schema'
import {
  findDepartmentSummariesByUserIds,
  lockActiveDepartmentsByIds,
} from '../departments/repository'
import { UserInvalidDepartmentError } from './errors'
import type { UserRow } from './mapper'

export type UserWithDepartmentsRow = {
  user: UserRow
  departments: DepartmentSummary[]
}

function buildUserDepartmentValues(userId: string, departmentIds: string[], now: Date) {
  return departmentIds.map((departmentId) => ({
    userId,
    departmentId,
    createdAt: now,
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

export function createUserRepository(database: Db) {
  return {
    async list(query: UserListQuery) {
      const { page, pageSize, keyword, status } = query
      const keywordFilter = keyword ? `%${keyword}%` : undefined
      const filters = [
        isNull(users.deletedAt),
        status === undefined ? undefined : eq(users.status, status),
        keywordFilter
          ? or(
              ilike(users.username, keywordFilter),
              ilike(users.nickname, keywordFilter),
              ilike(users.email, keywordFilter),
              ilike(users.phone, keywordFilter),
            )
          : undefined,
      ]
      const where = and(...filters)

      const [list, totalRows] = await Promise.all([
        database
          .select()
          .from(users)
          .where(where)
          .orderBy(desc(users.createdAt), desc(users.id))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        database
          .select({
            total: count(),
          })
          .from(users)
          .where(where),
      ])

      const departmentSummaries = await findDepartmentSummariesByUserIds(
        database,
        list.map((user) => user.id),
      )

      return {
        list: list.map((user) => ({
          user,
          departments: departmentSummaries.get(user.id) ?? [],
        })),
        total: totalRows[0]?.total ?? 0,
        page,
        pageSize,
      }
    },

    async findActiveById(id: string) {
      const rows = await database
        .select()
        .from(users)
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
        .limit(1)

      const user = rows[0]

      if (!user) {
        return undefined
      }

      const departmentSummaries = await findDepartmentSummariesByUserIds(database, [id])

      return {
        user,
        departments: departmentSummaries.get(id) ?? [],
      }
    },

    async create(input: UserCreateInput) {
      const { departmentIds = [], ...userInput } = input
      const now = new Date()

      return await database.transaction(async (tx) => {
        await lockActiveDepartmentIdsOrThrow(tx, departmentIds)

        const [created] = await tx
          .insert(users)
          .values({
            id: randomUUID(),
            ...userInput,
            createdAt: now,
            updatedAt: now,
          })
          .returning()

        if (!created) {
          throw new Error('创建用户失败')
        }

        if (departmentIds.length > 0) {
          await tx
            .insert(userDepartments)
            .values(buildUserDepartmentValues(created.id, departmentIds, now))
        }

        const departmentSummaries = await findDepartmentSummariesByUserIds(tx, [created.id])

        return {
          user: created,
          departments: departmentSummaries.get(created.id) ?? [],
        }
      })
    },

    async update(id: string, input: UserUpdateInput) {
      const { departmentIds, ...userInput } = input

      return await database.transaction(async (tx) => {
        const existingRows = await tx
          .select()
          .from(users)
          .where(and(eq(users.id, id), isNull(users.deletedAt)))
          .limit(1)
        const existingUser = existingRows[0]

        if (!existingUser) {
          return undefined
        }

        if (departmentIds !== undefined) {
          await lockActiveDepartmentIdsOrThrow(tx, departmentIds)
        }

        const [updated] = await tx
          .update(users)
          .set({
            ...userInput,
            updatedAt: new Date(),
          })
          .where(and(eq(users.id, id), isNull(users.deletedAt)))
          .returning()

        if (!updated) {
          return undefined
        }

        if (departmentIds !== undefined) {
          await tx.delete(userDepartments).where(eq(userDepartments.userId, id))

          if (departmentIds.length > 0) {
            await tx
              .insert(userDepartments)
              .values(buildUserDepartmentValues(updated.id, departmentIds, new Date()))
          }
        }

        const departmentSummaries = await findDepartmentSummariesByUserIds(tx, [updated.id])

        return {
          user: updated,
          departments: departmentSummaries.get(updated.id) ?? [],
        }
      })
    },

    async softDelete(id: string) {
      const now = new Date()

      return await database.transaction(async (tx) => {
        const [deleted] = await tx
          .update(users)
          .set({
            deletedAt: now,
            updatedAt: now,
          })
          .where(and(eq(users.id, id), isNull(users.deletedAt)))
          .returning()

        if (!deleted) {
          return undefined
        }

        await tx.delete(userDepartments).where(eq(userDepartments.userId, id))

        return deleted
      })
    },
  }
}
