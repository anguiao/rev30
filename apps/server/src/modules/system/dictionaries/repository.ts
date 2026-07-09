import { randomUUID } from 'node:crypto'
import { DICTIONARY_STATUS_ENABLED } from '@rev30/contracts'
import type {
  DictionaryOptionsQuery,
  DictionaryCreateInput,
  DictionaryListQuery,
  DictionaryUpdateInput,
} from '@rev30/contracts'
import { and, asc, count, desc, eq, ilike, inArray, isNull, notInArray, or, sql } from 'drizzle-orm'
import type { Db, DbReader } from '../../../db'
import { systemDictionaryItems, systemDictionaryTypes } from '../../../db/schema'
import { DictionaryInvalidItemError } from './errors'
import type { DictionaryItemRow, DictionaryListEntry, DictionaryOptionEntry } from './mapper'

function dictionaryTypeSortOrder() {
  return [
    asc(systemDictionaryTypes.sortOrder),
    desc(systemDictionaryTypes.createdAt),
    desc(systemDictionaryTypes.id),
  ] as const
}

function dictionaryItemSortOrder() {
  return [
    asc(systemDictionaryItems.sortOrder),
    desc(systemDictionaryItems.createdAt),
    desc(systemDictionaryItems.id),
  ] as const
}

async function findActiveTypeById(executor: DbReader, id: string) {
  const [row] = await executor
    .select()
    .from(systemDictionaryTypes)
    .where(and(eq(systemDictionaryTypes.id, id), isNull(systemDictionaryTypes.deletedAt)))
    .limit(1)

  return row
}

async function lockActiveTypeById(executor: DbReader, id: string) {
  const [row] = await executor
    .select()
    .from(systemDictionaryTypes)
    .where(and(eq(systemDictionaryTypes.id, id), isNull(systemDictionaryTypes.deletedAt)))
    .limit(1)
    .for('update')

  return row
}

async function findActiveItemsByTypeId(
  executor: DbReader,
  typeId: string,
): Promise<DictionaryItemRow[]> {
  return await executor
    .select()
    .from(systemDictionaryItems)
    .where(and(eq(systemDictionaryItems.typeId, typeId), isNull(systemDictionaryItems.deletedAt)))
    .orderBy(...dictionaryItemSortOrder())
}

export function createDictionaryRepository(database: Db) {
  return {
    async list(query: DictionaryListQuery) {
      const { page, pageSize, keyword, status } = query
      const keywordFilter = keyword ? `%${keyword}%` : undefined
      const filters = [
        isNull(systemDictionaryTypes.deletedAt),
        status === undefined ? undefined : eq(systemDictionaryTypes.status, status),
        keywordFilter
          ? or(
              ilike(systemDictionaryTypes.code, keywordFilter),
              ilike(systemDictionaryTypes.name, keywordFilter),
              ilike(systemDictionaryTypes.description, keywordFilter),
            )
          : undefined,
      ]
      const where = and(...filters)

      const dictionaryItemCounts = database
        .select({
          typeId: systemDictionaryItems.typeId,
          itemCount: sql<number>`count(${systemDictionaryItems.id})::int`.as('item_count'),
        })
        .from(systemDictionaryItems)
        .where(isNull(systemDictionaryItems.deletedAt))
        .groupBy(systemDictionaryItems.typeId)
        .as('dictionary_item_counts')

      const [list, totalRows] = await Promise.all([
        database
          .select({
            type: {
              id: systemDictionaryTypes.id,
              code: systemDictionaryTypes.code,
              name: systemDictionaryTypes.name,
              description: systemDictionaryTypes.description,
              status: systemDictionaryTypes.status,
              sortOrder: systemDictionaryTypes.sortOrder,
              createdAt: systemDictionaryTypes.createdAt,
              updatedAt: systemDictionaryTypes.updatedAt,
              deletedAt: systemDictionaryTypes.deletedAt,
            },
            itemCount: sql<number>`coalesce(${dictionaryItemCounts.itemCount}, 0)::int`.as(
              'item_count',
            ),
          })
          .from(systemDictionaryTypes)
          .leftJoin(dictionaryItemCounts, eq(dictionaryItemCounts.typeId, systemDictionaryTypes.id))
          .where(where)
          .orderBy(...dictionaryTypeSortOrder())
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        database
          .select({
            total: count(),
          })
          .from(systemDictionaryTypes)
          .where(where),
      ])

      return {
        list: list as DictionaryListEntry[],
        total: totalRows[0]?.total ?? 0,
        page,
        pageSize,
      }
    },

    async options(query: DictionaryOptionsQuery): Promise<DictionaryOptionEntry[]> {
      const activeTypes = await database
        .select({
          id: systemDictionaryTypes.id,
          code: systemDictionaryTypes.code,
        })
        .from(systemDictionaryTypes)
        .where(
          and(
            inArray(systemDictionaryTypes.code, query.codes),
            eq(systemDictionaryTypes.status, DICTIONARY_STATUS_ENABLED),
            isNull(systemDictionaryTypes.deletedAt),
          ),
        )

      if (activeTypes.length === 0) {
        return []
      }

      const codeByTypeId = new Map(activeTypes.map((type) => [type.id, type.code]))
      const items = await database
        .select({
          typeId: systemDictionaryItems.typeId,
          label: systemDictionaryItems.label,
          value: systemDictionaryItems.value,
        })
        .from(systemDictionaryItems)
        .where(
          and(
            inArray(
              systemDictionaryItems.typeId,
              activeTypes.map((type) => type.id),
            ),
            eq(systemDictionaryItems.status, DICTIONARY_STATUS_ENABLED),
            isNull(systemDictionaryItems.deletedAt),
          ),
        )
        .orderBy(...dictionaryItemSortOrder())

      return items.flatMap((item) => {
        const code = codeByTypeId.get(item.typeId)

        if (!code) {
          return []
        }

        return {
          code,
          label: item.label,
          value: item.value,
        }
      })
    },

    async findActiveById(id: string) {
      return await findActiveTypeById(database, id)
    },

    async findDetailById(id: string) {
      const dictionary = await findActiveTypeById(database, id)

      if (!dictionary) {
        return undefined
      }

      return {
        dictionary,
        items: await findActiveItemsByTypeId(database, dictionary.id),
      }
    },

    async create(input: DictionaryCreateInput) {
      return await database.transaction(async (tx) => {
        const { items, ...dictionaryInput } = input
        const [created] = await tx
          .insert(systemDictionaryTypes)
          .values({
            ...dictionaryInput,
          })
          .returning()

        if (!created) {
          throw new Error('创建数据字典失败')
        }

        if (items.length > 0) {
          await tx.insert(systemDictionaryItems).values(
            items.map((item) => ({
              typeId: created.id,
              ...item,
            })),
          )
        }

        return {
          dictionary: created,
          items: await findActiveItemsByTypeId(tx, created.id),
        }
      })
    },

    async update(id: string, input: DictionaryUpdateInput) {
      return await database.transaction(async (tx) => {
        const dictionary = await lockActiveTypeById(tx, id)

        if (!dictionary) {
          return undefined
        }

        const now = new Date()
        const { items, ...dictionaryInput } = input
        const existingItems = await tx
          .select()
          .from(systemDictionaryItems)
          .where(and(eq(systemDictionaryItems.typeId, id), isNull(systemDictionaryItems.deletedAt)))
          .orderBy(...dictionaryItemSortOrder())
          .for('update')

        const existingItemById = new Map(existingItems.map((item) => [item.id, item]))
        const updateItems = items.filter((item) => item.id !== undefined)
        const updateItemIds = [...new Set(updateItems.map((item) => item.id!))]

        if (updateItemIds.length !== updateItems.length) {
          throw new DictionaryInvalidItemError()
        }

        if (updateItemIds.some((itemId) => !existingItemById.has(itemId))) {
          throw new DictionaryInvalidItemError()
        }

        const [updatedDictionary] = await tx
          .update(systemDictionaryTypes)
          .set({
            ...dictionaryInput,
            updatedAt: now,
          })
          .where(and(eq(systemDictionaryTypes.id, id), isNull(systemDictionaryTypes.deletedAt)))
          .returning()

        if (!updatedDictionary) {
          return undefined
        }

        if (updateItemIds.length > 0) {
          await tx
            .update(systemDictionaryItems)
            .set({
              deletedAt: now,
              updatedAt: now,
            })
            .where(
              and(
                eq(systemDictionaryItems.typeId, id),
                isNull(systemDictionaryItems.deletedAt),
                notInArray(systemDictionaryItems.id, updateItemIds),
              ),
            )
        } else if (existingItems.length > 0) {
          await tx
            .update(systemDictionaryItems)
            .set({
              deletedAt: now,
              updatedAt: now,
            })
            .where(
              and(eq(systemDictionaryItems.typeId, id), isNull(systemDictionaryItems.deletedAt)),
            )
        }

        const itemsWithValueChange = updateItems.filter((item) => {
          const existingItem = existingItemById.get(item.id!)

          return existingItem !== undefined && existingItem.value !== item.value
        })

        for (const item of itemsWithValueChange) {
          await tx
            .update(systemDictionaryItems)
            .set({
              value: `__dictionary_tmp_${randomUUID()}`,
              updatedAt: now,
            })
            .where(
              and(
                eq(systemDictionaryItems.id, item.id!),
                eq(systemDictionaryItems.typeId, id),
                isNull(systemDictionaryItems.deletedAt),
              ),
            )
        }

        for (const item of updateItems) {
          await tx
            .update(systemDictionaryItems)
            .set({
              label: item.label,
              value: item.value,
              description: item.description,
              status: item.status,
              sortOrder: item.sortOrder,
              updatedAt: now,
            })
            .where(
              and(
                eq(systemDictionaryItems.id, item.id!),
                eq(systemDictionaryItems.typeId, id),
                isNull(systemDictionaryItems.deletedAt),
              ),
            )
        }

        const createItems = items.filter((item) => item.id === undefined)

        if (createItems.length > 0) {
          await tx.insert(systemDictionaryItems).values(
            createItems.map((item) => ({
              typeId: id,
              label: item.label,
              value: item.value,
              description: item.description,
              status: item.status,
              sortOrder: item.sortOrder,
            })),
          )
        }

        return {
          dictionary: updatedDictionary,
          items: await findActiveItemsByTypeId(tx, id),
        }
      })
    },

    async softDelete(id: string) {
      return await database.transaction(async (tx) => {
        const dictionary = await lockActiveTypeById(tx, id)

        if (!dictionary) {
          return undefined
        }

        const now = new Date()
        const [deletedDictionary] = await tx
          .update(systemDictionaryTypes)
          .set({
            deletedAt: now,
            updatedAt: now,
          })
          .where(and(eq(systemDictionaryTypes.id, id), isNull(systemDictionaryTypes.deletedAt)))
          .returning()

        if (!deletedDictionary) {
          return undefined
        }

        await tx
          .update(systemDictionaryItems)
          .set({
            deletedAt: now,
            updatedAt: now,
          })
          .where(and(eq(systemDictionaryItems.typeId, id), isNull(systemDictionaryItems.deletedAt)))

        return deletedDictionary
      })
    },
  }
}
