import { randomUUID } from 'node:crypto'
import type {
  DepartmentSummary,
  UserCreateInput,
  UserListQuery,
  UserUpdateInput,
} from '@rev30/shared'
import { and, asc, count, desc, eq, ilike, inArray, isNull, or } from 'drizzle-orm'
import type { Db } from '../../../db'
import { departments, userDepartments, users } from '../../../db/schema'
import { UserInvalidDepartmentError } from './errors'
import type { UserRow } from './mapper'

type DbExecutor = Pick<Db, 'select' | 'insert' | 'update' | 'delete'>

export type UserWithDepartmentsRow = {
  user: UserRow
  departments: DepartmentSummary[]
}

function buildUserDepartmentValues(userId: string, departmentIds: string[], now: Date) {
  return departmentIds.map((departmentId, index) => ({
    userId,
    departmentId,
    createdAt: new Date(now.getTime() + index),
  }))
}

async function checkAllActiveDepartmentIds(executor: DbExecutor, ids: string[]) {
  if (ids.length === 0) {
    return true
  }

  const rows = await executor
    .select({
      id: departments.id,
    })
    .from(departments)
    .where(and(inArray(departments.id, ids), isNull(departments.deletedAt)))

  return rows.length === ids.length
}

async function assertActiveDepartmentIds(executor: DbExecutor, ids: string[]) {
  if (!(await checkAllActiveDepartmentIds(executor, ids))) {
    throw new UserInvalidDepartmentError()
  }
}

async function findDepartmentSummariesByUserIds(executor: DbExecutor, userIds: string[]) {
  const summariesByUserId = new Map<string, DepartmentSummary[]>()

  if (userIds.length === 0) {
    return summariesByUserId
  }

  const rows = await executor
    .select({
      userId: userDepartments.userId,
      departmentId: departments.id,
      departmentName: departments.name,
      departmentCode: departments.code,
    })
    .from(userDepartments)
    .innerJoin(departments, eq(departments.id, userDepartments.departmentId))
    .where(and(inArray(userDepartments.userId, userIds), isNull(departments.deletedAt)))
    .orderBy(asc(userDepartments.createdAt), asc(userDepartments.departmentId))

  for (const row of rows) {
    const existingSummaries = summariesByUserId.get(row.userId) ?? []
    existingSummaries.push({
      id: row.departmentId,
      name: row.departmentName,
      code: row.departmentCode,
    })
    summariesByUserId.set(row.userId, existingSummaries)
  }

  return summariesByUserId
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
        await assertActiveDepartmentIds(tx, departmentIds)

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
          await assertActiveDepartmentIds(tx, departmentIds)
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
