import { USER_STATUS_ENABLED, type AttachmentListQuery } from '@rev30/contracts'
import { and, count, desc, eq, gt, ilike, isNull, or } from 'drizzle-orm'
import type { Db } from '../../db'
import { attachments, attachmentUploadSessions, systemUsers } from '../../db/schema'

export type AttachmentUploadSessionCreateRecord = typeof attachmentUploadSessions.$inferInsert

export function createAttachmentRepository(database: Db) {
  return {
    async findActiveById(id: string) {
      const [row] = await database
        .select()
        .from(attachments)
        .where(and(eq(attachments.id, id), isNull(attachments.deletedAt)))
        .limit(1)

      return row
    },

    async findActiveUserById(id: string) {
      const [row] = await database
        .select({ id: systemUsers.id })
        .from(systemUsers)
        .where(
          and(
            eq(systemUsers.id, id),
            eq(systemUsers.status, USER_STATUS_ENABLED),
            isNull(systemUsers.deletedAt),
          ),
        )
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

    async createUploadSession(input: AttachmentUploadSessionCreateRecord) {
      const [created] = await database.insert(attachmentUploadSessions).values(input).returning()

      if (!created) {
        throw new Error('创建附件上传会话失败')
      }

      return created
    },

    async findActiveUploadSession(id: string, requestedAt: Date) {
      const [row] = await database
        .select()
        .from(attachmentUploadSessions)
        .where(
          and(
            eq(attachmentUploadSessions.id, id),
            gt(attachmentUploadSessions.expiresAt, requestedAt),
          ),
        )
        .limit(1)

      return row
    },

    async claimPendingUploadSession(id: string, requestedAt: Date) {
      const [claimed] = await database
        .update(attachmentUploadSessions)
        .set({
          state: 'uploading',
          updatedAt: requestedAt,
        })
        .where(
          and(
            eq(attachmentUploadSessions.id, id),
            eq(attachmentUploadSessions.state, 'pending'),
            gt(attachmentUploadSessions.expiresAt, requestedAt),
          ),
        )
        .returning()

      return claimed
    },

    async resetUploadingUploadSession(id: string, updatedAt: Date) {
      const [reset] = await database
        .update(attachmentUploadSessions)
        .set({
          state: 'pending',
          updatedAt,
        })
        .where(
          and(eq(attachmentUploadSessions.id, id), eq(attachmentUploadSessions.state, 'uploading')),
        )
        .returning()

      return reset
    },

    async storeUploadSessionContent(
      id: string,
      input: {
        checksum: string
        extension: string
        mimeType: string
        size: number
        storageKey: string
        storageProvider: string
        storedAt: Date
      },
    ) {
      const [stored] = await database
        .update(attachmentUploadSessions)
        .set({
          checksum: input.checksum,
          extension: input.extension,
          mimeType: input.mimeType,
          state: 'stored',
          storageKey: input.storageKey,
          storageProvider: input.storageProvider,
          storedAt: input.storedAt,
          storedSize: input.size,
          updatedAt: input.storedAt,
        })
        .where(
          and(eq(attachmentUploadSessions.id, id), eq(attachmentUploadSessions.state, 'uploading')),
        )
        .returning()

      return stored
    },

    async completeUploadSession(id: string, userId: string, requestedAt: Date) {
      return database.transaction(async (tx) => {
        const [session] = await tx
          .delete(attachmentUploadSessions)
          .where(
            and(
              eq(attachmentUploadSessions.id, id),
              eq(attachmentUploadSessions.createdBy, userId),
              eq(attachmentUploadSessions.state, 'stored'),
              gt(attachmentUploadSessions.expiresAt, requestedAt),
            ),
          )
          .returning()

        if (!session) {
          return undefined
        }

        const [created] = await tx
          .insert(attachments)
          .values({
            checksum: session.checksum!,
            cleanupPolicy: session.cleanupPolicy,
            createdAt: session.storedAt!,
            createdBy: session.createdBy,
            extension: session.extension!,
            mimeType: session.mimeType!,
            originalName: session.originalName,
            readPolicy: session.readPolicy,
            size: session.storedSize!,
            storageKey: session.storageKey!,
            storageProvider: session.storageProvider!,
            usage: session.usage,
          })
          .returning()

        if (!created) {
          throw new Error('创建附件失败')
        }

        return created
      })
    },
  }
}
