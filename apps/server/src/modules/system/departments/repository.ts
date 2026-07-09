import {
  DEPARTMENT_STATUS_ENABLED,
  type DepartmentCreateInput,
  type DepartmentListQuery,
  type DepartmentStatus,
  type DepartmentSummary,
  type DepartmentTreeOptionsQuery,
  type DepartmentUpdateInput,
} from '@rev30/contracts'
import { and, asc, count, desc, eq, ilike, inArray, isNull, or } from 'drizzle-orm'
import type { Db, DbReader } from '../../../db'
import { systemDepartments, systemUserDepartments } from '../../../db/schema'
import { DepartmentDeleteConflictError, DepartmentInvalidParentError } from './errors'
import type { DepartmentRow, DepartmentTreeOptionEntry } from './mapper'

const departmentTreeOptionColumns = {
  id: systemDepartments.id,
  parentId: systemDepartments.parentId,
  name: systemDepartments.name,
  code: systemDepartments.code,
  status: systemDepartments.status,
} satisfies Record<keyof DepartmentTreeOptionEntry, unknown>

function departmentSortOrder() {
  return [
    asc(systemDepartments.sortOrder),
    desc(systemDepartments.createdAt),
    desc(systemDepartments.id),
  ] as const
}

async function hasActiveChildren(executor: DbReader, id: string) {
  const rows = await executor
    .select({ id: systemDepartments.id })
    .from(systemDepartments)
    .where(and(eq(systemDepartments.parentId, id), isNull(systemDepartments.deletedAt)))
    .limit(1)

  return rows.length > 0
}

async function hasUsers(executor: DbReader, id: string) {
  const rows = await executor
    .select({ userId: systemUserDepartments.userId })
    .from(systemUserDepartments)
    .where(eq(systemUserDepartments.departmentId, id))
    .limit(1)

  return rows.length > 0
}

export async function lockActiveDepartmentsByIds(executor: DbReader, ids: string[]) {
  const rows: DepartmentRow[] = []
  const sortedIds = [...new Set(ids)].sort()

  for (const id of sortedIds) {
    const [row] = await executor
      .select()
      .from(systemDepartments)
      .where(and(eq(systemDepartments.id, id), isNull(systemDepartments.deletedAt)))
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
      userId: systemUserDepartments.userId,
      departmentId: systemDepartments.id,
      departmentName: systemDepartments.name,
      departmentCode: systemDepartments.code,
    })
    .from(systemUserDepartments)
    .innerJoin(systemDepartments, eq(systemDepartments.id, systemUserDepartments.departmentId))
    .where(and(inArray(systemUserDepartments.userId, userIds), isNull(systemDepartments.deletedAt)))
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
  async function fillActiveAncestors(entries: DepartmentTreeOptionEntry[]) {
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
        .select(departmentTreeOptionColumns)
        .from(systemDepartments)
        .where(
          and(
            inArray(systemDepartments.id, unresolvedParentIds),
            isNull(systemDepartments.deletedAt),
          ),
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
    async list(query: DepartmentListQuery) {
      const { page, pageSize, keyword, status, parentId } = query
      const keywordFilter = keyword ? `%${keyword}%` : undefined
      const filters = [
        isNull(systemDepartments.deletedAt),
        status === undefined ? undefined : eq(systemDepartments.status, status),
        parentId === undefined ? undefined : eq(systemDepartments.parentId, parentId),
        keywordFilter
          ? or(
              ilike(systemDepartments.name, keywordFilter),
              ilike(systemDepartments.code, keywordFilter),
            )
          : undefined,
      ]
      const where = and(...filters)

      const [list, totalRows] = await Promise.all([
        database
          .select()
          .from(systemDepartments)
          .where(where)
          .orderBy(...departmentSortOrder())
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        database
          .select({
            total: count(),
          })
          .from(systemDepartments)
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
        .from(systemDepartments)
        .where(and(eq(systemDepartments.id, id), isNull(systemDepartments.deletedAt)))
        .limit(1)

      return rows[0]
    },

    async findActiveByIds(ids: string[]) {
      if (ids.length === 0) {
        return []
      }

      return await database
        .select()
        .from(systemDepartments)
        .where(and(inArray(systemDepartments.id, ids), isNull(systemDepartments.deletedAt)))
    },

    async findActiveChildren(parentId: string) {
      return await database
        .select()
        .from(systemDepartments)
        .where(and(eq(systemDepartments.parentId, parentId), isNull(systemDepartments.deletedAt)))
        .orderBy(...departmentSortOrder())
    },

    async listTreeRows() {
      return await database
        .select()
        .from(systemDepartments)
        .where(isNull(systemDepartments.deletedAt))
        .orderBy(...departmentSortOrder())
    },

    async treeOptions(query: DepartmentTreeOptionsQuery) {
      const { includeIds } = query
      const includeIdSet = new Set(includeIds)
      const enabledStatus = DEPARTMENT_STATUS_ENABLED as DepartmentStatus
      const baseWhere = and(
        isNull(systemDepartments.deletedAt),
        includeIds.length > 0
          ? or(
              eq(systemDepartments.status, enabledStatus),
              inArray(systemDepartments.id, includeIds),
            )
          : eq(systemDepartments.status, enabledStatus),
      )
      const selectedRows = await database
        .select(departmentTreeOptionColumns)
        .from(systemDepartments)
        .where(baseWhere)
      const includeRows = selectedRows.filter((row) => includeIdSet.has(row.id))
      const enabledRows = selectedRows.filter((row) => row.status === enabledStatus)
      const ancestorRowsMap = await fillActiveAncestors(includeRows)
      const rowsMap = new Map<string, DepartmentTreeOptionEntry>()

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
        .select(departmentTreeOptionColumns)
        .from(systemDepartments)
        .where(and(isNull(systemDepartments.deletedAt), inArray(systemDepartments.id, rowIds)))
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

        const [created] = await tx.insert(systemDepartments).values(input).returning()

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
          .update(systemDepartments)
          .set(input)
          .where(and(eq(systemDepartments.id, id), isNull(systemDepartments.deletedAt)))
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
          .update(systemDepartments)
          .set({
            deletedAt: now,
            updatedAt: now,
          })
          .where(and(eq(systemDepartments.id, id), isNull(systemDepartments.deletedAt)))
          .returning()

        return deleted
      })
    },
  }
}
