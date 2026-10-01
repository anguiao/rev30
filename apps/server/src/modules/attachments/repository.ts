import {
  ATTACHMENT_READ_POLICY_AUTHENTICATED,
  type AttachmentImageListQuery,
  type AttachmentListQuery,
  type AttachmentReference,
} from '@rev30/contracts'
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNull,
  like,
  ne,
  or,
  sql,
} from 'drizzle-orm'
import { unionAll } from 'drizzle-orm/pg-core'
import type { Db } from '../../db'
import {
  announcements,
  attachmentReferences,
  attachments,
  attachmentUploadSessions,
  systemUsers,
} from '../../db/schema'

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

    async listImages(query: AttachmentImageListQuery) {
      const { page, pageSize, usage, keyword } = query
      const where = and(
        isNull(attachments.deletedAt),
        eq(attachments.readPolicy, ATTACHMENT_READ_POLICY_AUTHENTICATED),
        like(attachments.mimeType, 'image/%'),
        ne(attachments.mimeType, 'image/svg+xml'),
        usage === undefined ? undefined : eq(attachments.usage, usage),
        keyword
          ? sql<boolean>`strpos(lower(${attachments.originalName}), lower(${keyword})) > 0`
          : undefined,
      )
      const [list, totalRows] = await Promise.all([
        database
          .select()
          .from(attachments)
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

    async listReferences(attachmentIds: string[]) {
      if (attachmentIds.length === 0) {
        return []
      }

      const sources = unionAll(
        database
          .select({
            attachmentId: sql<string>`${attachmentReferences.attachmentId}`.as('attachment_id'),
            sourceType: sql<AttachmentReference['sourceType']>`'announcement'`.as('source_type'),
            sourceId: sql<string>`${announcements.id}`.as('source_id'),
            label: sql<string>`${announcements.title}`.as('label'),
          })
          .from(attachmentReferences)
          .innerJoin(announcements, eq(announcements.id, attachmentReferences.sourceId))
          .where(
            and(
              inArray(attachmentReferences.attachmentId, attachmentIds),
              eq(attachmentReferences.sourceType, 'announcement'),
              eq(attachmentReferences.sourceField, 'contentJson'),
              isNull(announcements.deletedAt),
            ),
          ),
        database
          .select({
            attachmentId: sql<string>`${systemUsers.avatarId}`.as('attachment_id'),
            sourceType: sql<AttachmentReference['sourceType']>`'user'`.as('source_type'),
            sourceId: sql<string>`${systemUsers.id}`.as('source_id'),
            label:
              sql<string>`${systemUsers.nickname} || ' (' || ${systemUsers.username} || ')'`.as(
                'label',
              ),
          })
          .from(systemUsers)
          .where(and(inArray(systemUsers.avatarId, attachmentIds), isNull(systemUsers.deletedAt))),
      ).as('attachment_reference_sources')

      return database.select().from(sources).orderBy(asc(sources.sourceType), asc(sources.sourceId))
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
