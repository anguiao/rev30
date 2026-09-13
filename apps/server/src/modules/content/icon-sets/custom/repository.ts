import type {
  CustomIconSetCreateInput,
  CustomIconSetUpdateInput,
  CustomIconUpdateInput,
  IconSetIconListQuery,
  IconSetListQuery,
} from '@rev30/contracts'
import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm'
import type { Db, DbReader } from '../../../../db'
import { customIconSetIcons, customIconSets } from '../../../../db/schema'
import { formatIconCursor, parseIconCursor } from '../cursor'
import { CustomIconSetNotFoundError, toCustomIconConflictError } from './errors'
import type { CustomIconEntry, CustomIconSetEntry, CustomIconSetRow } from './mapper'
import type { ParsedSvgIcon } from './svg'
import {
  deleteCustomIconSearchDocument,
  deleteCustomIconSearchDocumentsByPrefix,
  lockIconSearchWrites,
  syncCustomIconSearchDocument,
  searchIconDocuments,
} from '../../../icons/search/repository'
import { InvalidIconCursorError } from '../../../icons/search/errors'

const customIconColumns = {
  id: customIconSetIcons.id,
  setId: customIconSetIcons.setId,
  name: customIconSetIcons.name,
  body: customIconSetIcons.body,
  width: customIconSetIcons.width,
  height: customIconSetIcons.height,
  palette: customIconSetIcons.palette,
  keywords: customIconSetIcons.keywords,
  createdAt: customIconSetIcons.createdAt,
  updatedAt: customIconSetIcons.updatedAt,
  deletedAt: customIconSetIcons.deletedAt,
  prefix: customIconSets.prefix,
  setName: customIconSets.name,
} satisfies Record<keyof CustomIconEntry, unknown>

async function withCustomIconConflictTranslation<T>(operation: () => Promise<T>) {
  try {
    return await operation()
  } catch (error) {
    const conflict = toCustomIconConflictError(error)

    if (conflict) {
      throw conflict
    }

    throw error
  }
}

async function findActiveSetByPrefix(executor: DbReader, prefix: string) {
  const [row] = await executor
    .select()
    .from(customIconSets)
    .where(and(eq(customIconSets.prefix, prefix), isNull(customIconSets.deletedAt)))
    .limit(1)

  return row
}

async function findActiveSetById(executor: DbReader, id: string) {
  const [row] = await executor
    .select()
    .from(customIconSets)
    .where(and(eq(customIconSets.id, id), isNull(customIconSets.deletedAt)))
    .limit(1)

  return row
}

async function countActiveIcons(executor: DbReader, setId: string) {
  const [row] = await executor
    .select({
      total: count(),
    })
    .from(customIconSetIcons)
    .where(and(eq(customIconSetIcons.setId, setId), isNull(customIconSetIcons.deletedAt)))

  return row?.total ?? 0
}

async function findActiveIconById(
  executor: DbReader,
  id: string,
): Promise<CustomIconEntry | undefined> {
  const [row] = await executor
    .select(customIconColumns)
    .from(customIconSetIcons)
    .innerJoin(customIconSets, eq(customIconSetIcons.setId, customIconSets.id))
    .where(
      and(
        eq(customIconSetIcons.id, id),
        isNull(customIconSetIcons.deletedAt),
        isNull(customIconSets.deletedAt),
      ),
    )
    .limit(1)

  return row
}

export function createCustomIconSetRepository(database: Db) {
  async function syncIcon(
    executor: Parameters<Parameters<Db['transaction']>[0]>[0],
    set: CustomIconSetRow,
    icon: typeof customIconSetIcons.$inferSelect,
  ) {
    await syncCustomIconSearchDocument(executor, {
      id: `${set.prefix}:${icon.name}`,
      prefix: set.prefix,
      name: icon.name,
      collection: set.name,
      palette: icon.palette,
      customIconId: icon.id,
      keywords: icon.keywords,
    })
  }

  return {
    async listSets(query: IconSetListQuery) {
      const { keyword } = query
      const keywordFilter = keyword ? `%${keyword}%` : undefined
      const where = and(
        isNull(customIconSets.deletedAt),
        keywordFilter
          ? or(
              ilike(customIconSets.prefix, keywordFilter),
              ilike(customIconSets.name, keywordFilter),
              ilike(customIconSets.description, keywordFilter),
            )
          : undefined,
      )

      const [rows, totalRows] = await Promise.all([
        database
          .select()
          .from(customIconSets)
          .where(where)
          .orderBy(
            desc(customIconSets.updatedAt),
            desc(customIconSets.createdAt),
            asc(customIconSets.prefix),
          ),
        database
          .select({
            total: count(),
          })
          .from(customIconSets)
          .where(where),
      ])
      const setIds = rows.map((row) => row.id)
      const iconCountRows =
        setIds.length === 0
          ? []
          : await database
              .select({
                setId: customIconSetIcons.setId,
                total: count(),
              })
              .from(customIconSetIcons)
              .where(
                and(
                  inArray(customIconSetIcons.setId, setIds),
                  isNull(customIconSetIcons.deletedAt),
                ),
              )
              .groupBy(customIconSetIcons.setId)
      const iconCounts = new Map(iconCountRows.map((row) => [row.setId, row.total]))
      const list = rows.map((row) => ({
        set: row,
        iconCount: iconCounts.get(row.id) ?? 0,
      }))

      return {
        list,
        total: totalRows[0]?.total ?? 0,
      }
    },

    async findSetByPrefix(prefix: string) {
      return await findActiveSetByPrefix(database, prefix)
    },

    async getSet(prefix: string) {
      const row = await findActiveSetByPrefix(database, prefix)

      if (!row) {
        return undefined
      }

      return {
        set: row,
        iconCount: await countActiveIcons(database, row.id),
      }
    },

    async hasCustomPrefix(prefix: string) {
      return (await findActiveSetByPrefix(database, prefix)) !== undefined
    },

    async createSet(input: CustomIconSetCreateInput): Promise<CustomIconSetEntry> {
      const [created] = await withCustomIconConflictTranslation(() =>
        database.insert(customIconSets).values(input).returning(),
      )

      if (!created) {
        throw new Error('创建自定义图标集失败')
      }

      return {
        set: created,
        iconCount: 0,
      }
    },

    async updateSet(prefix: string, input: CustomIconSetUpdateInput) {
      return await withCustomIconConflictTranslation(() =>
        database.transaction(async (tx) => {
          await lockIconSearchWrites(tx)
          const [updated] = await tx
            .update(customIconSets)
            .set(input)
            .where(and(eq(customIconSets.prefix, prefix), isNull(customIconSets.deletedAt)))
            .returning()

          if (!updated) return undefined
          const icons = await tx
            .select()
            .from(customIconSetIcons)
            .where(
              and(eq(customIconSetIcons.setId, updated.id), isNull(customIconSetIcons.deletedAt)),
            )
          for (const icon of icons) await syncIcon(tx, updated, icon)

          return { set: updated, iconCount: await countActiveIcons(tx, updated.id) }
        }),
      )
    },

    async softDeleteSet(prefix: string) {
      const now = new Date()

      return await database.transaction(async (tx) => {
        await lockIconSearchWrites(tx)
        const [deleted] = await tx
          .update(customIconSets)
          .set({
            deletedAt: now,
            updatedAt: now,
          })
          .where(and(eq(customIconSets.prefix, prefix), isNull(customIconSets.deletedAt)))
          .returning()

        if (!deleted) {
          return undefined
        }

        await tx
          .update(customIconSetIcons)
          .set({
            deletedAt: now,
            updatedAt: now,
          })
          .where(
            and(eq(customIconSetIcons.setId, deleted.id), isNull(customIconSetIcons.deletedAt)),
          )

        await deleteCustomIconSearchDocumentsByPrefix(tx, prefix)

        return deleted
      })
    },

    async listIcons(query: IconSetIconListQuery) {
      const { pageSize, keyword, prefix } = query
      if (keyword) {
        const found = await searchIconDocuments(database, {
          query: keyword,
          source: 'custom',
          ...(prefix ? { prefix } : {}),
          ...(query.cursor ? { cursor: query.cursor } : {}),
          limit: pageSize,
        })
        const customIds = found.rows.flatMap((row) => row.customIconId ?? [])
        const fetched =
          customIds.length === 0
            ? []
            : await database
                .select(customIconColumns)
                .from(customIconSetIcons)
                .innerJoin(customIconSets, eq(customIconSetIcons.setId, customIconSets.id))
                .where(
                  and(
                    inArray(customIconSetIcons.id, customIds),
                    isNull(customIconSets.deletedAt),
                    isNull(customIconSetIcons.deletedAt),
                  ),
                )
        const byId = new Map(fetched.map((row) => [row.id, row]))
        const list = found.rows.flatMap((row) =>
          row.customIconId ? (byId.get(row.customIconId) ?? []) : [],
        )
        return { list, nextCursor: found.nextCursor, pageSize }
      }
      const cursorBinding = {
        mode: 'browse' as const,
        query: '',
        source: 'custom' as const,
        ...(prefix ? { prefix } : {}),
      }
      const cursor = parseIconCursor(query.cursor, cursorBinding)
      if (cursor && !('id' in cursor)) throw new InvalidIconCursorError()
      const fullId = sql`${customIconSets.prefix} || ':' || ${customIconSetIcons.name}`
      const where = and(
        isNull(customIconSets.deletedAt),
        isNull(customIconSetIcons.deletedAt),
        prefix ? eq(customIconSets.prefix, prefix) : undefined,
        cursor ? sql`${fullId} COLLATE "C" > ${cursor.id}` : undefined,
      )
      const rows = await database
        .select(customIconColumns)
        .from(customIconSetIcons)
        .innerJoin(customIconSets, eq(customIconSetIcons.setId, customIconSets.id))
        .where(where)
        .orderBy(sql`${fullId} COLLATE "C"`)
        .limit(pageSize + 1)
      const list = rows.slice(0, pageSize)
      const lastItem = list.at(-1)

      return {
        list,
        nextCursor:
          rows.length > pageSize && lastItem
            ? formatIconCursor(cursorBinding, { id: `${lastItem.prefix}:${lastItem.name}` })
            : null,
        pageSize,
      }
    },

    async listAllIconsForExport(prefix: string) {
      return await database
        .select(customIconColumns)
        .from(customIconSetIcons)
        .innerJoin(customIconSets, eq(customIconSetIcons.setId, customIconSets.id))
        .where(
          and(
            eq(customIconSets.prefix, prefix),
            isNull(customIconSets.deletedAt),
            isNull(customIconSetIcons.deletedAt),
          ),
        )
        .orderBy(asc(customIconSetIcons.name))
    },

    async findIcon(setId: string, name: string) {
      const [row] = await database
        .select()
        .from(customIconSetIcons)
        .where(
          and(
            eq(customIconSetIcons.setId, setId),
            eq(customIconSetIcons.name, name),
            isNull(customIconSetIcons.deletedAt),
          ),
        )
        .limit(1)

      return row
    },

    async createIcon(set: CustomIconSetRow, parsed: ParsedSvgIcon, keywords: string[] = []) {
      return await withCustomIconConflictTranslation(() =>
        database.transaction(async (tx) => {
          await lockIconSearchWrites(tx)
          const currentSet = await findActiveSetById(tx, set.id)
          if (!currentSet) throw new CustomIconSetNotFoundError()
          const [created] = await tx
            .insert(customIconSetIcons)
            .values({
              setId: currentSet.id,
              name: parsed.name,
              body: parsed.body,
              width: parsed.width,
              height: parsed.height,
              palette: parsed.palette,
              keywords,
            })
            .returning()

          if (!created) throw new Error('创建图标失败')
          await syncIcon(tx, currentSet, created)
          const row = await findActiveIconById(tx, created.id)

          if (!row) throw new Error('创建图标失败')

          return row
        }),
      )
    },

    async replaceIcon(iconId: string, parsed: ParsedSvgIcon, keywords?: string[]) {
      return await withCustomIconConflictTranslation(() =>
        database.transaction(async (tx) => {
          await lockIconSearchWrites(tx)
          const [updated] = await tx
            .update(customIconSetIcons)
            .set({
              body: parsed.body,
              width: parsed.width,
              height: parsed.height,
              palette: parsed.palette,
              ...(keywords === undefined ? {} : { keywords }),
            })
            .where(and(eq(customIconSetIcons.id, iconId), isNull(customIconSetIcons.deletedAt)))
            .returning()

          if (!updated) return undefined
          const row = await findActiveIconById(tx, updated.id)
          if (!row) return undefined
          await syncCustomIconSearchDocument(tx, {
            id: `${row.prefix}:${row.name}`,
            prefix: row.prefix,
            name: row.name,
            collection: row.setName,
            palette: row.palette,
            customIconId: row.id,
            keywords: row.keywords,
          })

          return row
        }),
      )
    },

    async updateIcon(prefix: string, oldName: string, input: CustomIconUpdateInput) {
      return await withCustomIconConflictTranslation(() =>
        database.transaction(async (tx) => {
          await lockIconSearchWrites(tx)
          const [updated] = await tx
            .update(customIconSetIcons)
            .set(input)
            .from(customIconSets)
            .where(
              and(
                eq(customIconSetIcons.setId, customIconSets.id),
                eq(customIconSets.prefix, prefix),
                eq(customIconSetIcons.name, oldName),
                isNull(customIconSets.deletedAt),
                isNull(customIconSetIcons.deletedAt),
              ),
            )
            .returning()

          if (!updated) return undefined
          const row = await findActiveIconById(tx, updated.id)
          if (!row) return undefined
          await syncCustomIconSearchDocument(tx, {
            id: `${row.prefix}:${row.name}`,
            prefix: row.prefix,
            name: row.name,
            collection: row.setName,
            palette: row.palette,
            customIconId: row.id,
            keywords: row.keywords,
          })

          return row
        }),
      )
    },

    async softDeleteIcon(prefix: string, name: string) {
      return await database.transaction(async (tx) => {
        await lockIconSearchWrites(tx)
        const now = new Date()
        const [deleted] = await tx
          .update(customIconSetIcons)
          .set({
            deletedAt: now,
            updatedAt: now,
          })
          .from(customIconSets)
          .where(
            and(
              eq(customIconSetIcons.setId, customIconSets.id),
              eq(customIconSets.prefix, prefix),
              eq(customIconSetIcons.name, name),
              isNull(customIconSets.deletedAt),
              isNull(customIconSetIcons.deletedAt),
            ),
          )
          .returning()

        if (deleted) await deleteCustomIconSearchDocument(tx, deleted.id)
        return deleted
      })
    },
  }
}
