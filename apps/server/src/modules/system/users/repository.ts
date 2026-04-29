import { randomUUID } from 'node:crypto'
import type {
  SystemUserCreateInput,
  SystemUserListQuery,
  SystemUserUpdateInput,
} from '@rev30/shared'
import { and, count, desc, eq, ilike, isNull, ne, or } from 'drizzle-orm'
import type { Db } from '../../../db'
import { users } from '../../../db/schema'
import type { UniqueField } from './errors'

export function createSystemUserRepository(database: Db) {
  return {
    async list(query: SystemUserListQuery) {
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

    async existsActive(id: string) {
      const rows = await database
        .select({
          id: users.id,
        })
        .from(users)
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
        .limit(1)

      return rows[0] !== undefined
    },

    async findUniqueConflict(
      input: Partial<Record<UniqueField, string | null | undefined>>,
      excludeId?: string,
    ) {
      const checks = [
        input.username ? eq(users.username, input.username) : undefined,
        input.email ? eq(users.email, input.email) : undefined,
        input.phone ? eq(users.phone, input.phone) : undefined,
      ].filter((condition) => condition !== undefined)

      if (checks.length === 0) {
        return undefined
      }

      const rows = await database
        .select({
          id: users.id,
          username: users.username,
          email: users.email,
          phone: users.phone,
        })
        .from(users)
        .where(and(or(...checks), excludeId ? ne(users.id, excludeId) : undefined))
        .limit(1)

      const conflict = rows[0]

      if (!conflict) {
        return undefined
      }

      if (input.username && conflict.username === input.username) {
        return 'username'
      }

      if (input.email && conflict.email === input.email) {
        return 'email'
      }

      if (input.phone && conflict.phone === input.phone) {
        return 'phone'
      }

      return undefined
    },

    async create(input: SystemUserCreateInput) {
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
        throw new Error('Failed to create user')
      }

      return created
    },

    async update(id: string, input: SystemUserUpdateInput) {
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
