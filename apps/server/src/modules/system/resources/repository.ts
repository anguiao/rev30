import {
  RESOURCE_OPEN_TARGET_BLANK,
  RESOURCE_OPEN_TARGET_SELF,
  RESOURCE_STATUS_ENABLED,
  RESOURCE_TYPE_ACTION,
  RESOURCE_TYPE_DIRECTORY,
  RESOURCE_TYPE_EXTERNAL,
  RESOURCE_TYPE_MENU,
  type Resource,
  type ResourceCreateInput,
  type ResourceListQuery,
  type ResourceStatus,
  type ResourceTreeOptionsQuery,
  type ResourceUpdateInput,
  resourceExternalUrlSchema,
} from '@rev30/contracts'
import { and, asc, count, desc, eq, ilike, inArray, isNull, or } from 'drizzle-orm'
import type { Db, DbReader } from '../../../db'
import { systemRoleResources, systemResources } from '../../../db/schema'
import {
  ResourceDeleteConflictError,
  ResourceInvalidParentError,
  ResourceInvalidTypeFieldsError,
  ResourceMoveConflictError,
  ResourceRoleAuthorizationConflictError,
} from './errors'
import type { ResourceRow, ResourceTreeOptionEntry } from './mapper'

const resourceTreeOptionColumns = {
  id: systemResources.id,
  parentId: systemResources.parentId,
  type: systemResources.type,
  name: systemResources.name,
  code: systemResources.code,
  status: systemResources.status,
} satisfies Record<keyof ResourceTreeOptionEntry, unknown>

function resourceSortOrder() {
  return [
    asc(systemResources.sortOrder),
    desc(systemResources.createdAt),
    desc(systemResources.id),
  ] as const
}

async function lockActiveResourcesByIds(executor: DbReader, ids: string[]) {
  const rows: ResourceRow[] = []
  const sortedIds = [...new Set(ids)].sort()

  for (const id of sortedIds) {
    const [row] = await executor
      .select()
      .from(systemResources)
      .where(and(eq(systemResources.id, id), isNull(systemResources.deletedAt)))
      .limit(1)
      .for('update')

    if (row) {
      rows.push(row)
    }
  }

  return rows
}

async function lockActiveResourceById(executor: DbReader, id: string) {
  const rows = await lockActiveResourcesByIds(executor, [id])

  return rows[0]
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

function normalizeExternalUrl(externalUrl: string) {
  const normalizedExternalUrl = externalUrl.trim()
  const urlResult = resourceExternalUrlSchema.safeParse(normalizedExternalUrl)

  if (!urlResult.success) {
    throw new ResourceInvalidTypeFieldsError('外链地址无效', 'externalUrl')
  }

  return normalizedExternalUrl
}

function normalizeCreateTypeFields(input: ResourceCreateInput): ResourceCreateInput {
  const next: ResourceCreateInput = { ...input }

  if (input.type === RESOURCE_TYPE_MENU) {
    if (input.path === null) {
      throw new ResourceInvalidTypeFieldsError('内部菜单路径不能为空', 'path')
    }

    next.path = input.path
    next.externalUrl = null
    next.openTarget = input.openTarget ?? RESOURCE_OPEN_TARGET_SELF
  }

  if (input.type === RESOURCE_TYPE_EXTERNAL) {
    if (input.externalUrl === null) {
      throw new ResourceInvalidTypeFieldsError('外链地址不能为空', 'externalUrl')
    }

    next.path = null
    next.externalUrl = normalizeExternalUrl(input.externalUrl)
    next.openTarget = input.openTarget ?? RESOURCE_OPEN_TARGET_BLANK
  }

  if (input.type === RESOURCE_TYPE_DIRECTORY || input.type === RESOURCE_TYPE_ACTION) {
    next.path = null
    next.externalUrl = null
    next.openTarget = RESOURCE_OPEN_TARGET_SELF
  }

  return next
}

function normalizeUpdateTypeFields(
  input: ResourceUpdateInput,
  existing: ResourceRow,
): ResourceUpdateInput {
  const type = input.type ?? (existing.type as Resource['type'])
  const existingType = existing.type as Resource['type']
  const next: ResourceUpdateInput = { ...input }
  const path = input.path !== undefined ? input.path : existing.path
  const externalUrl = input.externalUrl !== undefined ? input.externalUrl : existing.externalUrl

  if (type === RESOURCE_TYPE_MENU) {
    if (path === null) {
      throw new ResourceInvalidTypeFieldsError('内部菜单路径不能为空', 'path')
    }

    next.path = path
    next.externalUrl = null

    if (input.openTarget !== undefined) {
      next.openTarget = input.openTarget
    } else if (existingType !== RESOURCE_TYPE_MENU) {
      next.openTarget = RESOURCE_OPEN_TARGET_SELF
    }
  }

  if (type === RESOURCE_TYPE_EXTERNAL) {
    if (externalUrl === null) {
      throw new ResourceInvalidTypeFieldsError('外链地址不能为空', 'externalUrl')
    }

    next.path = null
    next.externalUrl = normalizeExternalUrl(externalUrl)

    if (input.openTarget !== undefined) {
      next.openTarget = input.openTarget
    } else if (existingType !== RESOURCE_TYPE_EXTERNAL) {
      next.openTarget = RESOURCE_OPEN_TARGET_BLANK
    }
  }

  if (type === RESOURCE_TYPE_DIRECTORY || type === RESOURCE_TYPE_ACTION) {
    next.path = null
    next.externalUrl = null
    next.openTarget = RESOURCE_OPEN_TARGET_SELF
  }

  return next
}

async function findActiveResourceParentChain(executor: DbReader, parentId: string) {
  const rows: ResourceRow[] = []
  const visitedIds = new Set<string>()
  let currentId: string | null = parentId

  while (currentId && !visitedIds.has(currentId)) {
    visitedIds.add(currentId)

    const [row] = await executor
      .select()
      .from(systemResources)
      .where(and(eq(systemResources.id, currentId), isNull(systemResources.deletedAt)))
      .limit(1)

    if (!row) {
      break
    }

    rows.push(row)
    currentId = row.parentId
  }

  return rows
}

async function lockResourceForUpdate(
  executor: DbReader,
  id: string,
  parentId: string | null | undefined,
) {
  const candidateParentRows =
    parentId === undefined || parentId === null
      ? []
      : await findActiveResourceParentChain(executor, parentId)
  const lockedRows = await lockActiveResourcesByIds(executor, [
    id,
    ...candidateParentRows.map((row) => row.id),
  ])
  const rowsById = new Map(lockedRows.map((row) => [row.id, row]))
  const resource = rowsById.get(id)

  if (!resource || parentId === undefined || parentId === null) {
    return resource
  }

  if (!rowsById.has(parentId)) {
    throw new ResourceInvalidParentError()
  }

  for (const candidateParent of candidateParentRows) {
    const lockedParent = rowsById.get(candidateParent.id)

    if (!lockedParent || lockedParent.parentId !== candidateParent.parentId) {
      throw new ResourceMoveConflictError()
    }
  }

  const visitedIds = new Set<string>()
  let currentId: string | null = parentId

  while (currentId) {
    if (currentId === id || visitedIds.has(currentId)) {
      throw new ResourceMoveConflictError()
    }

    visitedIds.add(currentId)

    const current = rowsById.get(currentId)

    if (!current) {
      break
    }

    currentId = current.parentId
  }

  return resource
}

export function createResourceRepository(database: Db) {
  async function fillActiveAncestors(entries: ResourceTreeOptionEntry[]) {
    const entryMap = new Map(entries.map((entry) => [entry.id, entry]))
    let missingParentIds = [
      ...new Set(entries.map((entry) => entry.parentId).filter((id) => id !== null)),
    ]

    while (missingParentIds.length > 0) {
      const unresolvedParentIds = missingParentIds.filter((id) => !entryMap.has(id))

      if (unresolvedParentIds.length === 0) {
        break
      }

      const parentEntries = await database
        .select(resourceTreeOptionColumns)
        .from(systemResources)
        .where(
          and(inArray(systemResources.id, unresolvedParentIds), isNull(systemResources.deletedAt)),
        )

      if (parentEntries.length === 0) {
        break
      }

      for (const parentEntry of parentEntries) {
        entryMap.set(parentEntry.id, parentEntry)
      }

      missingParentIds = [
        ...new Set(parentEntries.map((entry) => entry.parentId).filter((id) => id !== null)),
      ]
    }

    return entryMap
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
      const rowsMap = new Map<string, ResourceTreeOptionEntry>()

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

    async create(input: ResourceCreateInput) {
      return await database.transaction(async (tx) => {
        if (input.parentId !== null && !(await lockActiveResourceById(tx, input.parentId))) {
          throw new ResourceInvalidParentError()
        }

        const normalizedInput = normalizeCreateTypeFields(input)

        const [created] = await tx.insert(systemResources).values(normalizedInput).returning()

        if (!created) {
          throw new Error('创建资源失败')
        }

        return created
      })
    },

    async update(id: string, input: ResourceUpdateInput) {
      return await database.transaction(async (tx) => {
        const resource = await lockResourceForUpdate(tx, id, input.parentId)

        if (!resource) {
          return undefined
        }

        const normalizedInput = normalizeUpdateTypeFields(input, resource)

        const [updated] = await tx
          .update(systemResources)
          .set(normalizedInput)
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
