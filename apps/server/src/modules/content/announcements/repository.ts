import { randomUUID } from 'node:crypto'
import type {
  AnnouncementCreateInput,
  AnnouncementListQuery,
  AnnouncementUpdateInput,
} from '@rev30/contracts'
import {
  ANNOUNCEMENT_STATUS_ARCHIVED,
  ANNOUNCEMENT_STATUS_DRAFT,
  ANNOUNCEMENT_STATUS_PUBLISHED,
} from '@rev30/contracts'
import { and, count, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm'
import type { Db } from '../../../db'
import { contentAnnouncements } from '../../../db/schema'
import { deriveAnnouncementContentText } from './content'

function announcementSortOrder() {
  return [
    desc(contentAnnouncements.pinned),
    sql`case
      when ${contentAnnouncements.status} = ${ANNOUNCEMENT_STATUS_PUBLISHED} then 0
      when ${contentAnnouncements.status} = ${ANNOUNCEMENT_STATUS_DRAFT} then 1
      when ${contentAnnouncements.status} = ${ANNOUNCEMENT_STATUS_ARCHIVED} then 2
      else 3
    end`,
    desc(contentAnnouncements.publishedAt),
    desc(contentAnnouncements.updatedAt),
    desc(contentAnnouncements.createdAt),
    desc(contentAnnouncements.id),
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

    async create(input: AnnouncementCreateInput) {
      const { publish, ...announcementInput } = input
      const now = new Date()

      const [created] = await database
        .insert(contentAnnouncements)
        .values({
          id: randomUUID(),
          ...announcementInput,
          contentText: deriveAnnouncementContentText(announcementInput.contentJson),
          status: publish ? ANNOUNCEMENT_STATUS_PUBLISHED : ANNOUNCEMENT_STATUS_DRAFT,
          publishedAt: publish ? now : null,
        })
        .returning()

      if (!created) {
        throw new Error('创建通知公告失败')
      }

      return created
    },

    async update(id: string, input: AnnouncementUpdateInput) {
      const { publish, ...announcementInput } = input

      const [updated] = await database
        .update(contentAnnouncements)
        .set({
          ...announcementInput,
          contentText:
            announcementInput.contentJson === undefined
              ? undefined
              : deriveAnnouncementContentText(announcementInput.contentJson),
          status: publish ? ANNOUNCEMENT_STATUS_PUBLISHED : undefined,
          publishedAt: publish ? new Date() : undefined,
        })
        .where(and(eq(contentAnnouncements.id, id), isNull(contentAnnouncements.deletedAt)))
        .returning()

      return updated
    },

    async publish(id: string) {
      const [updated] = await database
        .update(contentAnnouncements)
        .set({
          status: ANNOUNCEMENT_STATUS_PUBLISHED,
          publishedAt: new Date(),
        })
        .where(and(eq(contentAnnouncements.id, id), isNull(contentAnnouncements.deletedAt)))
        .returning()

      return updated
    },

    async archive(id: string) {
      const [updated] = await database
        .update(contentAnnouncements)
        .set({
          status: ANNOUNCEMENT_STATUS_ARCHIVED,
        })
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
