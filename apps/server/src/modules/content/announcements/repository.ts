import { randomUUID } from 'node:crypto'
import type {
  AnnouncementListQuery,
  AnnouncementStatus,
  AnnouncementType,
  TiptapDocument,
} from '@rev30/shared'
import { and, count, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm'
import type { Db } from '../../../db'
import { contentAnnouncements } from '../../../db/schema'

type AnnouncementCreateRecord = {
  type: AnnouncementType
  title: string
  summary?: string | null
  contentJson: TiptapDocument
  contentText: string
  status: AnnouncementStatus
  pinned: boolean
  publishedAt: Date | null
}

type AnnouncementUpdateRecord = Partial<AnnouncementCreateRecord>

function announcementSortOrder() {
  return [
    desc(contentAnnouncements.pinned),
    sql`${contentAnnouncements.publishedAt} IS NULL`,
    desc(contentAnnouncements.publishedAt),
    desc(contentAnnouncements.updatedAt),
  ] as const
}

export function createAnnouncementRepository(database: Db) {
  return {
    async list(query: AnnouncementListQuery) {
      const { page, pageSize, keyword, type, status, pinned } = query
      const keywordFilter = keyword ? `%${keyword}%` : undefined
      const filters = [
        isNull(contentAnnouncements.deletedAt),
        type === undefined ? undefined : eq(contentAnnouncements.type, type),
        status === undefined ? undefined : eq(contentAnnouncements.status, status),
        pinned === undefined ? undefined : eq(contentAnnouncements.pinned, pinned),
        keywordFilter
          ? or(
              ilike(contentAnnouncements.title, keywordFilter),
              ilike(contentAnnouncements.summary, keywordFilter),
              ilike(contentAnnouncements.contentText, keywordFilter),
            )
          : undefined,
      ]
      const where = and(...filters)

      const [list, totalRows] = await Promise.all([
        database
          .select()
          .from(contentAnnouncements)
          .where(where)
          .orderBy(...announcementSortOrder())
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        database
          .select({
            total: count(),
          })
          .from(contentAnnouncements)
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
        .from(contentAnnouncements)
        .where(and(eq(contentAnnouncements.id, id), isNull(contentAnnouncements.deletedAt)))
        .limit(1)

      return row
    },

    async create(input: AnnouncementCreateRecord) {
      const [created] = await database
        .insert(contentAnnouncements)
        .values({
          id: randomUUID(),
          ...input,
        })
        .returning()

      if (!created) {
        throw new Error('创建通知公告失败')
      }

      return created
    },

    async update(id: string, input: AnnouncementUpdateRecord) {
      const [updated] = await database
        .update(contentAnnouncements)
        .set(input)
        .where(and(eq(contentAnnouncements.id, id), isNull(contentAnnouncements.deletedAt)))
        .returning()

      return updated
    },

    async softDelete(id: string) {
      const now = new Date()
      const [deleted] = await database
        .update(contentAnnouncements)
        .set({
          deletedAt: now,
          updatedAt: now,
        })
        .where(and(eq(contentAnnouncements.id, id), isNull(contentAnnouncements.deletedAt)))
        .returning()

      return deleted
    },
  }
}
