import { randomUUID } from 'node:crypto'
import type { ResourceCreateInput, ResourceListQuery, ResourceUpdateInput } from '@rev30/shared'
import { and, asc, count, desc, eq, ilike, isNull, or } from 'drizzle-orm'
import type { Db, DbReader } from '../../../db'
import { roleResources, systemResources } from '../../../db/schema'
import {
  ResourceDeleteConflictError,
  ResourceInvalidParentError,
  ResourceRoleAuthorizationConflictError,
} from './errors'

function resourceSortOrder() {
  return [
    asc(systemResources.sortOrder),
    desc(systemResources.createdAt),
    desc(systemResources.id),
  ] as const
}

async function lockActiveResourceById(executor: DbReader, id: string) {
  const [row] = await executor
    .select()
    .from(systemResources)
    .where(and(eq(systemResources.id, id), isNull(systemResources.deletedAt)))
    .limit(1)
    .for('update')

  return row
}

async function hasActiveChildren(executor: DbReader, id: string) {
  const rows = await executor
    .select({ id: systemResources.id })
    .from(systemResources)
    .where(and(eq(systemResources.parentId, id), isNull(systemResources.deletedAt)))
    .limit(1)

  return rows.length > 0
}

async function hasRoleAuthorizations(executor: DbReader, id: string) {
  const rows = await executor
    .select({ roleId: roleResources.roleId })
    .from(roleResources)
    .where(eq(roleResources.resourceId, id))
    .limit(1)

  return rows.length > 0
}

export function createResourceRepository(database: Db) {
  return {
    async list(query: ResourceListQuery) {
      const { page, pageSize, keyword, type, status, parentId } = query
      const keywordFilter = keyword ? `%${keyword}%` : undefined
      const filters = [
        isNull(systemResources.deletedAt),
        type === undefined ? undefined : eq(systemResources.type, type),
        status === undefined ? undefined : eq(systemResources.status, status),
        parentId === undefined ? undefined : eq(systemResources.parentId, parentId),
        keywordFilter
          ? or(
              ilike(systemResources.name, keywordFilter),
              ilike(systemResources.code, keywordFilter),
              ilike(systemResources.path, keywordFilter),
              ilike(systemResources.externalUrl, keywordFilter),
            )
          : undefined,
      ]
      const where = and(...filters)

      const [list, totalRows] = await Promise.all([
        database
          .select()
          .from(systemResources)
          .where(where)
          .orderBy(...resourceSortOrder())
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        database
          .select({
            total: count(),
          })
          .from(systemResources)
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
        .from(systemResources)
        .where(and(eq(systemResources.id, id), isNull(systemResources.deletedAt)))
        .limit(1)

      return rows[0]
    },

    async listTreeRows() {
      return await database
        .select()
        .from(systemResources)
        .where(isNull(systemResources.deletedAt))
        .orderBy(...resourceSortOrder())
    },

    async hasActiveChildren(id: string) {
      return await hasActiveChildren(database, id)
    },

    async hasRoleAuthorizations(id: string) {
      return await hasRoleAuthorizations(database, id)
    },

    async create(input: ResourceCreateInput) {
      return await database.transaction(async (tx) => {
        if (input.parentId !== null && !(await lockActiveResourceById(tx, input.parentId))) {
          throw new ResourceInvalidParentError()
        }

        const [created] = await tx
          .insert(systemResources)
          .values({
            id: randomUUID(),
            ...input,
          })
          .returning()

        if (!created) {
          throw new Error('创建资源失败')
        }

        return created
      })
    },

    async update(id: string, input: ResourceUpdateInput) {
      return await database.transaction(async (tx) => {
        if (
          input.parentId !== undefined &&
          input.parentId !== null &&
          !(await lockActiveResourceById(tx, input.parentId))
        ) {
          throw new ResourceInvalidParentError()
        }

        const [updated] = await tx
          .update(systemResources)
          .set(input)
          .where(and(eq(systemResources.id, id), isNull(systemResources.deletedAt)))
          .returning()

        return updated
      })
    },

    async softDelete(id: string) {
      const now = new Date()

      return await database.transaction(async (tx) => {
        const resource = await lockActiveResourceById(tx, id)

        if (!resource) {
          return undefined
        }

        if (await hasActiveChildren(tx, id)) {
          throw new ResourceDeleteConflictError()
        }

        if (await hasRoleAuthorizations(tx, id)) {
          throw new ResourceRoleAuthorizationConflictError()
        }

        const [deleted] = await tx
          .update(systemResources)
          .set({
            deletedAt: now,
            updatedAt: now,
          })
          .where(and(eq(systemResources.id, id), isNull(systemResources.deletedAt)))
          .returning()

        return deleted
      })
    },
  }
}
