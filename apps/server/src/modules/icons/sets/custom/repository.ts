import type {
  CustomIconSetCreateInput,
  CustomIconSetUpdateInput,
  IconSetIconListQuery,
  IconSetListQuery,
  IconSetRenameIconInput,
} from '@rev30/contracts'
import { and, asc, count, desc, eq, ilike, isNull, or } from 'drizzle-orm'
import type { Db, DbReader } from '../../../../db'
import { customIconSetIcons, customIconSets } from '../../../../db/schema'
import { toCustomIconConflictError } from './errors'
import type { IconRow, SetRow } from './mapper'
import type { ParsedSvgIcon } from './svg'

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

async function countActiveIcons(executor: DbReader, setId: string) {
  const [row] = await executor
    .select({
      total: count(),
    })
    .from(customIconSetIcons)
    .where(and(eq(customIconSetIcons.setId, setId), isNull(customIconSetIcons.deletedAt)))

  return row?.total ?? 0
}

async function findActiveIconById(executor: DbReader, id: string): Promise<IconRow | undefined> {
  const [row] = await executor
    .select({
      id: customIconSetIcons.id,
      setId: customIconSetIcons.setId,
      name: customIconSetIcons.name,
      body: customIconSetIcons.body,
      width: customIconSetIcons.width,
      height: customIconSetIcons.height,
      palette: customIconSetIcons.palette,
      createdAt: customIconSetIcons.createdAt,
      updatedAt: customIconSetIcons.updatedAt,
      deletedAt: customIconSetIcons.deletedAt,
      prefix: customIconSets.prefix,
      setName: customIconSets.name,
    })
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
      const list = await Promise.all(
        rows.map(async (row) => ({
          ...row,
          iconCount: await countActiveIcons(database, row.id),
        })),
      )

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
        ...row,
        iconCount: await countActiveIcons(database, row.id),
      }
    },

    async hasCustomPrefix(prefix: string) {
      return (await findActiveSetByPrefix(database, prefix)) !== undefined
    },

    async createSet(input: CustomIconSetCreateInput): Promise<SetRow & { iconCount: number }> {
      const [created] = await withCustomIconConflictTranslation(() =>
        database.insert(customIconSets).values(input).returning(),
      )

      if (!created) {
        throw new Error('创建自定义图标集失败')
      }

      return {
        ...created,
        iconCount: 0,
      }
    },

    async updateSet(prefix: string, input: CustomIconSetUpdateInput) {
      const [updated] = await withCustomIconConflictTranslation(() =>
        database
          .update(customIconSets)
          .set(input)
          .where(and(eq(customIconSets.prefix, prefix), isNull(customIconSets.deletedAt)))
          .returning(),
      )

      if (!updated) {
        return undefined
      }

      return {
        ...updated,
        iconCount: await countActiveIcons(database, updated.id),
      }
    },

    async softDeleteSet(prefix: string) {
      const now = new Date()

      return await database.transaction(async (tx) => {
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

        return deleted
      })
    },

    async listIcons(query: IconSetIconListQuery) {
      const { page, pageSize, keyword, prefix } = query
      const keywordFilter = keyword ? `%${keyword}%` : undefined
      const where = and(
        isNull(customIconSets.deletedAt),
        isNull(customIconSetIcons.deletedAt),
        prefix ? eq(customIconSets.prefix, prefix) : undefined,
        keywordFilter
          ? or(
              ilike(customIconSets.prefix, keywordFilter),
              ilike(customIconSets.name, keywordFilter),
              ilike(customIconSetIcons.name, keywordFilter),
            )
          : undefined,
      )
      const baseSelect = {
        id: customIconSetIcons.id,
        setId: customIconSetIcons.setId,
        name: customIconSetIcons.name,
        body: customIconSetIcons.body,
        width: customIconSetIcons.width,
        height: customIconSetIcons.height,
        palette: customIconSetIcons.palette,
        createdAt: customIconSetIcons.createdAt,
        updatedAt: customIconSetIcons.updatedAt,
        deletedAt: customIconSetIcons.deletedAt,
        prefix: customIconSets.prefix,
        setName: customIconSets.name,
      }

      const [list, totalRows] = await Promise.all([
        database
          .select(baseSelect)
          .from(customIconSetIcons)
          .innerJoin(customIconSets, eq(customIconSetIcons.setId, customIconSets.id))
          .where(where)
          .orderBy(asc(customIconSets.prefix), asc(customIconSetIcons.name))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        database
          .select({
            total: count(),
          })
          .from(customIconSetIcons)
          .innerJoin(customIconSets, eq(customIconSetIcons.setId, customIconSets.id))
          .where(where),
      ])

      return {
        list,
        total: totalRows[0]?.total ?? 0,
        page,
        pageSize,
      }
    },

    async listAllIconsForExport(prefix: string) {
      return await database
        .select({
          id: customIconSetIcons.id,
          setId: customIconSetIcons.setId,
          name: customIconSetIcons.name,
          body: customIconSetIcons.body,
          width: customIconSetIcons.width,
          height: customIconSetIcons.height,
          palette: customIconSetIcons.palette,
          createdAt: customIconSetIcons.createdAt,
          updatedAt: customIconSetIcons.updatedAt,
          deletedAt: customIconSetIcons.deletedAt,
          prefix: customIconSets.prefix,
          setName: customIconSets.name,
        })
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

    async createIcon(set: SetRow, parsed: ParsedSvgIcon) {
      const [created] = await withCustomIconConflictTranslation(() =>
        database
          .insert(customIconSetIcons)
          .values({
            setId: set.id,
            name: parsed.name,
            body: parsed.body,
            width: parsed.width,
            height: parsed.height,
            palette: parsed.palette,
          })
          .returning(),
      )

      if (!created) {
        throw new Error('创建图标失败')
      }

      const row = await findActiveIconById(database, created.id)

      if (!row) {
        throw new Error('创建图标失败')
      }

      return row
    },

    async replaceIcon(_set: SetRow, iconId: string, parsed: ParsedSvgIcon) {
      const [updated] = await withCustomIconConflictTranslation(() =>
        database
          .update(customIconSetIcons)
          .set({
            body: parsed.body,
            width: parsed.width,
            height: parsed.height,
            palette: parsed.palette,
          })
          .where(and(eq(customIconSetIcons.id, iconId), isNull(customIconSetIcons.deletedAt)))
          .returning(),
      )

      if (!updated) {
        return undefined
      }

      return await findActiveIconById(database, updated.id)
    },

    async renameIcon(prefix: string, oldName: string, input: IconSetRenameIconInput) {
      const [updated] = await withCustomIconConflictTranslation(() =>
        database
          .update(customIconSetIcons)
          .set({
            name: input.name,
          })
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
          .returning(),
      )

      if (!updated) {
        return undefined
      }

      return await findActiveIconById(database, updated.id)
    },

    async softDeleteIcon(prefix: string, name: string) {
      const now = new Date()
      const [deleted] = await database
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

      return deleted
    },
  }
}
