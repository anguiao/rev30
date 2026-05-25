import { randomUUID } from 'node:crypto'
import type { ConfigCreateInput, ConfigListQuery, ConfigUpdateInput } from '@rev30/contracts'
import { and, asc, count, eq, ilike, isNull, or } from 'drizzle-orm'
import type { Db } from '../../../db'
import { systemConfigs } from '../../../db/schema'

function configSortOrder() {
  return [
    asc(systemConfigs.groupCode),
    asc(systemConfigs.sortOrder),
    asc(systemConfigs.key),
  ] as const
}

export function createConfigRepository(database: Db) {
  return {
    async list(query: ConfigListQuery) {
      const { page, pageSize, keyword, groupCode, valueType, status } = query
      const keywordFilter = keyword ? `%${keyword}%` : undefined
      const filters = [
        isNull(systemConfigs.deletedAt),
        groupCode === undefined ? undefined : eq(systemConfigs.groupCode, groupCode),
        valueType === undefined ? undefined : eq(systemConfigs.valueType, valueType),
        status === undefined ? undefined : eq(systemConfigs.status, status),
        keywordFilter
          ? or(
              ilike(systemConfigs.key, keywordFilter),
              ilike(systemConfigs.name, keywordFilter),
              ilike(systemConfigs.description, keywordFilter),
            )
          : undefined,
      ]
      const where = and(...filters)

      const [list, totalRows] = await Promise.all([
        database
          .select()
          .from(systemConfigs)
          .where(where)
          .orderBy(...configSortOrder())
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        database
          .select({
            total: count(),
          })
          .from(systemConfigs)
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
      const [row] = await database
        .select()
        .from(systemConfigs)
        .where(and(eq(systemConfigs.id, id), isNull(systemConfigs.deletedAt)))
        .limit(1)

      return row
    },

    async create(input: ConfigCreateInput) {
      const [created] = await database
        .insert(systemConfigs)
        .values({
          id: randomUUID(),
          ...input,
        })
        .returning()

      if (!created) {
        throw new Error('创建系统配置失败')
      }

      return created
    },

    async update(id: string, input: ConfigUpdateInput) {
      const [updated] = await database
        .update(systemConfigs)
        .set(input)
        .where(and(eq(systemConfigs.id, id), isNull(systemConfigs.deletedAt)))
        .returning()

      return updated
    },

    async softDelete(id: string) {
      const now = new Date()
      const [deleted] = await database
        .update(systemConfigs)
        .set({
          deletedAt: now,
          updatedAt: now,
        })
        .where(and(eq(systemConfigs.id, id), isNull(systemConfigs.deletedAt)))
        .returning()

      return deleted
    },
  }
}
