import type { AttachmentListQuery } from '@rev30/contracts'
import { and, count, desc, eq, ilike, isNull, or } from 'drizzle-orm'
import type { Db } from '../../db'
import { attachments, systemUsers } from '../../db/schema'

export type AttachmentCreateRecord = typeof attachments.$inferInsert

export function createAttachmentRepository(database: Db) {
  return {
    async create(input: AttachmentCreateRecord) {
      const [created] = await database.insert(attachments).values(input).returning()

      if (!created) {
        throw new Error('创建附件失败')
      }

      return created
    },

    async findActiveById(id: string) {
      const [row] = await database
        .select()
        .from(attachments)
        .where(and(eq(attachments.id, id), isNull(attachments.deletedAt)))
        .limit(1)

      return row
    },

    async list(query: AttachmentListQuery) {
      const { page, pageSize, usage, keyword } = query
      const keywordFilter = keyword ? `%${keyword}%` : undefined
      const filters = [
        isNull(attachments.deletedAt),
        usage === undefined ? undefined : eq(attachments.usage, usage),
        keywordFilter
          ? or(
              ilike(attachments.originalName, keywordFilter),
              ilike(attachments.mimeType, keywordFilter),
              ilike(attachments.extension, keywordFilter),
            )
          : undefined,
      ]
      const where = and(...filters)

      const [list, totalRows] = await Promise.all([
        database
          .select({
            attachment: attachments,
            createdBy: {
              id: systemUsers.id,
              username: systemUsers.username,
              nickname: systemUsers.nickname,
            },
          })
          .from(attachments)
          .innerJoin(systemUsers, eq(systemUsers.id, attachments.createdBy))
          .where(where)
          .orderBy(desc(attachments.createdAt), desc(attachments.id))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        database.select({ total: count() }).from(attachments).where(where),
      ])

      return {
        list,
        total: totalRows[0]?.total ?? 0,
        page,
        pageSize,
      }
    },

    async softDelete(id: string, deletedAt: Date) {
      const [deleted] = await database
        .update(attachments)
        .set({ deletedAt })
        .where(and(eq(attachments.id, id), isNull(attachments.deletedAt)))
        .returning()

      return deleted
    },
  }
}
