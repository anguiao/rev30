import { and, eq, isNull } from 'drizzle-orm'
import type { Db } from '../../db'
import { attachments } from '../../db/schema'

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
