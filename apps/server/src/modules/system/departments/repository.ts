import { randomUUID } from 'node:crypto'
import type {
  DepartmentCreateInput,
  DepartmentListQuery,
  DepartmentSummary,
  DepartmentUpdateInput,
} from '@rev30/shared'
import { and, asc, count, desc, eq, ilike, inArray, isNull, or } from 'drizzle-orm'
import type { Db, DbReader } from '../../../db'
import { departments, userDepartments } from '../../../db/schema'
import { DepartmentDeleteConflictError, DepartmentInvalidParentError } from './errors'
import type { DepartmentRow } from './mapper'

function departmentSortOrder() {
  return [asc(departments.sortOrder), desc(departments.createdAt), desc(departments.id)] as const
}

async function hasActiveChildren(executor: DbReader, id: string) {
  const rows = await executor
    .select({ id: departments.id })
    .from(departments)
    .where(and(eq(departments.parentId, id), isNull(departments.deletedAt)))
    .limit(1)

  return rows.length > 0
}

async function hasUsers(executor: DbReader, id: string) {
  const rows = await executor
    .select({ userId: userDepartments.userId })
    .from(userDepartments)
    .where(eq(userDepartments.departmentId, id))
    .limit(1)

  return rows.length > 0
}

export async function lockActiveDepartmentsByIds(executor: DbReader, ids: string[]) {
  const rows: DepartmentRow[] = []
  const sortedIds = [...new Set(ids)].sort()

  for (const id of sortedIds) {
    const [row] = await executor
      .select()
      .from(departments)
      .where(and(eq(departments.id, id), isNull(departments.deletedAt)))
      .limit(1)
      .for('update')

    if (row) {
      rows.push(row)
    }
  }

  return rows
}

export async function findDepartmentSummariesByUserIds(executor: DbReader, userIds: string[]) {
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
    .orderBy(...departmentSortOrder())

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

export async function findDepartmentSummariesByUserId(executor: DbReader, userId: string) {
  const summariesByUserId = await findDepartmentSummariesByUserIds(executor, [userId])

  return summariesByUserId.get(userId) ?? []
}

async function lockActiveDepartmentById(executor: DbReader, id: string) {
  const rows = await lockActiveDepartmentsByIds(executor, [id])

  return rows[0]
}

export function createDepartmentRepository(database: Db) {
  return {
    async list(query: DepartmentListQuery) {
      const { page, pageSize, keyword, status, parentId } = query
      const keywordFilter = keyword ? `%${keyword}%` : undefined
      const filters = [
        isNull(departments.deletedAt),
        status === undefined ? undefined : eq(departments.status, status),
        parentId === undefined ? undefined : eq(departments.parentId, parentId),
        keywordFilter
          ? or(ilike(departments.name, keywordFilter), ilike(departments.code, keywordFilter))
          : undefined,
      ]
      const where = and(...filters)

      const [list, totalRows] = await Promise.all([
        database
          .select()
          .from(departments)
          .where(where)
          .orderBy(...departmentSortOrder())
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        database
          .select({
            total: count(),
          })
          .from(departments)
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
        .from(departments)
        .where(and(eq(departments.id, id), isNull(departments.deletedAt)))
        .limit(1)

      return rows[0]
    },

    async findActiveByIds(ids: string[]) {
      if (ids.length === 0) {
        return []
      }

      return await database
        .select()
        .from(departments)
        .where(and(inArray(departments.id, ids), isNull(departments.deletedAt)))
    },

    async findActiveChildren(parentId: string) {
      return await database
        .select()
        .from(departments)
        .where(and(eq(departments.parentId, parentId), isNull(departments.deletedAt)))
        .orderBy(...departmentSortOrder())
    },

    async listTreeRows() {
      return await database
        .select()
        .from(departments)
        .where(isNull(departments.deletedAt))
        .orderBy(...departmentSortOrder())
    },

    async hasActiveChildren(id: string) {
      return await hasActiveChildren(database, id)
    },

    async hasUsers(id: string) {
      return await hasUsers(database, id)
    },

    async create(input: DepartmentCreateInput) {
      return await database.transaction(async (tx) => {
        if (input.parentId !== null && !(await lockActiveDepartmentById(tx, input.parentId))) {
          throw new DepartmentInvalidParentError()
        }

        const [created] = await tx
          .insert(departments)
          .values({
            id: randomUUID(),
            ...input,
          })
          .returning()

        if (!created) {
          throw new Error('创建部门失败')
        }

        return created
      })
    },

    async update(id: string, input: DepartmentUpdateInput) {
      return await database.transaction(async (tx) => {
        if (
          input.parentId !== undefined &&
          input.parentId !== null &&
          !(await lockActiveDepartmentById(tx, input.parentId))
        ) {
          throw new DepartmentInvalidParentError()
        }

        const [updated] = await tx
          .update(departments)
          .set(input)
          .where(and(eq(departments.id, id), isNull(departments.deletedAt)))
          .returning()

        return updated
      })
    },

    async softDelete(id: string) {
      const now = new Date()

      return await database.transaction(async (tx) => {
        const department = await lockActiveDepartmentById(tx, id)

        if (!department) {
          return undefined
        }

        if (await hasActiveChildren(tx, id)) {
          throw new DepartmentDeleteConflictError('部门存在子部门，不能删除')
        }

        if (await hasUsers(tx, id)) {
          throw new DepartmentDeleteConflictError('部门存在关联用户，不能删除')
        }

        const [deleted] = await tx
          .update(departments)
          .set({
            deletedAt: now,
            updatedAt: now,
          })
          .where(and(eq(departments.id, id), isNull(departments.deletedAt)))
          .returning()

        return deleted
      })
    },
  }
}
