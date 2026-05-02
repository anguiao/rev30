import { randomUUID } from 'node:crypto'
import type { UserCreateInput, UserListQuery, UserUpdateInput } from '@rev30/shared'
import { and, count, desc, eq, ilike, isNull, or } from 'drizzle-orm'
import type { Db } from '../../../db'
import { users } from '../../../db/schema'

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
        .from(users)
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
        .limit(1)

      return rows[0]
    },

    async create(input: UserCreateInput) {
      const now = new Date()
      const [created] = await database
        .insert(users)
        .values({
          id: randomUUID(),
          ...input,
          createdAt: now,
          updatedAt: now,
        })
        .returning()

      if (!created) {
        throw new Error('创建用户失败')
      }

      return created
    },

    async update(id: string, input: UserUpdateInput) {
      const [updated] = await database
        .update(users)
        .set({
          ...input,
          updatedAt: new Date(),
        })
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
        .returning()

      return updated
    },

    async softDelete(id: string) {
      const now = new Date()
      const [deleted] = await database
        .update(users)
        .set({
          deletedAt: now,
          updatedAt: now,
        })
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
        .returning()

      return deleted
    },
  }
}
