import { randomUUID } from 'node:crypto'
import type {
  DepartmentCreateInput,
  DepartmentListQuery,
  DepartmentUpdateInput,
} from '@rev30/shared'
import { and, asc, count, desc, eq, ilike, inArray, isNull, or } from 'drizzle-orm'
import type { Db } from '../../../db'
import { departments, userDepartments } from '../../../db/schema'

function departmentSortOrder() {
  return [asc(departments.sortOrder), desc(departments.createdAt), desc(departments.id)] as const
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
      const rows = await database
        .select({ id: departments.id })
        .from(departments)
        .where(and(eq(departments.parentId, id), isNull(departments.deletedAt)))
        .limit(1)

      return rows.length > 0
    },

    async hasUsers(id: string) {
      const rows = await database
        .select({ userId: userDepartments.userId })
        .from(userDepartments)
        .where(eq(userDepartments.departmentId, id))
        .limit(1)

      return rows.length > 0
    },

    async create(input: DepartmentCreateInput) {
      const now = new Date()
      const [created] = await database
        .insert(departments)
        .values({
          id: randomUUID(),
          ...input,
          createdAt: now,
          updatedAt: now,
        })
        .returning()

      if (!created) {
        throw new Error('创建部门失败')
      }

      return created
    },

    async update(id: string, input: DepartmentUpdateInput) {
      const [updated] = await database
        .update(departments)
        .set({
          ...input,
          updatedAt: new Date(),
        })
        .where(and(eq(departments.id, id), isNull(departments.deletedAt)))
        .returning()

      return updated
    },

    async softDelete(id: string) {
      const now = new Date()
      const [deleted] = await database
        .update(departments)
        .set({
          deletedAt: now,
          updatedAt: now,
        })
        .where(and(eq(departments.id, id), isNull(departments.deletedAt)))
        .returning()

      return deleted
    },
  }
}
