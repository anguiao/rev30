import { randomUUID } from 'node:crypto'
import {
  RESOURCE_STATUS_ENABLED,
  type ResourceCreateInput,
  type ResourceListQuery,
  type ResourceStatus,
  type ResourceTreeOptionsQuery,
  type ResourceUpdateInput,
} from '@rev30/contracts'
import { and, asc, count, desc, eq, ilike, inArray, isNull, or } from 'drizzle-orm'
import type { Db, DbReader } from '../../../db'
import { systemRoleResources, systemResources } from '../../../db/schema'
import {
  ResourceDeleteConflictError,
  ResourceInvalidParentError,
  ResourceRoleAuthorizationConflictError,
} from './errors'
import type { ResourceTreeOptionRow } from './mapper'

const resourceTreeOptionColumns = {
  id: systemResources.id,
  parentId: systemResources.parentId,
  type: systemResources.type,
  name: systemResources.name,
  code: systemResources.code,
  status: systemResources.status,
} satisfies Record<keyof ResourceTreeOptionRow, unknown>

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
    .select({ roleId: systemRoleResources.roleId })
    .from(systemRoleResources)
    .where(eq(systemRoleResources.resourceId, id))
    .limit(1)

  return rows.length > 0
}

export function createResourceRepository(database: Db) {
  async function fillActiveAncestors(rows: ResourceTreeOptionRow[]) {
    const rowMap = new Map(rows.map((row) => [row.id, row]))
    let missingParentIds = [...new Set(rows.map((row) => row.parentId).filter((id) => id !== null))]

    while (missingParentIds.length > 0) {
      const unresolvedParentIds = missingParentIds.filter((id) => !rowMap.has(id))

      if (unresolvedParentIds.length === 0) {
        break
      }

      const parentRows = await database
        .select(resourceTreeOptionColumns)
        .from(systemResources)
        .where(
          and(inArray(systemResources.id, unresolvedParentIds), isNull(systemResources.deletedAt)),
        )

      if (parentRows.length === 0) {
        break
      }

      for (const parentRow of parentRows) {
        rowMap.set(parentRow.id, parentRow)
      }

      missingParentIds = [
        ...new Set(parentRows.map((row) => row.parentId).filter((id) => id !== null)),
      ]
    }

    return rowMap
  }

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

    async findActiveByIds(ids: string[]) {
      if (ids.length === 0) {
        return []
      }

      return await database
        .select()
        .from(systemResources)
        .where(and(inArray(systemResources.id, ids), isNull(systemResources.deletedAt)))
    },

    async listTreeRows() {
      return await database
        .select()
        .from(systemResources)
        .where(isNull(systemResources.deletedAt))
        .orderBy(...resourceSortOrder())
    },

    async treeOptions(query: ResourceTreeOptionsQuery) {
      const { includeIds } = query
      const includeIdSet = new Set(includeIds)
      const enabledStatus = RESOURCE_STATUS_ENABLED as ResourceStatus
      const baseWhere = and(
        isNull(systemResources.deletedAt),
        includeIds.length > 0
          ? or(eq(systemResources.status, enabledStatus), inArray(systemResources.id, includeIds))
          : eq(systemResources.status, enabledStatus),
      )
      const selectedRows = await database
        .select(resourceTreeOptionColumns)
        .from(systemResources)
        .where(baseWhere)
      const includeRows = selectedRows.filter((row) => includeIdSet.has(row.id))
      const enabledRows = selectedRows.filter((row) => row.status === enabledStatus)
      const ancestorRowsMap = await fillActiveAncestors(includeRows)
      const rowsMap = new Map<string, ResourceTreeOptionRow>()

      for (const row of enabledRows) {
        rowsMap.set(row.id, row)
      }

      for (const [id, row] of ancestorRowsMap) {
        rowsMap.set(id, row)
      }

      const rowIds = [...rowsMap.keys()]

      if (rowIds.length === 0) {
        return []
      }

      return await database
        .select(resourceTreeOptionColumns)
        .from(systemResources)
        .where(and(isNull(systemResources.deletedAt), inArray(systemResources.id, rowIds)))
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
