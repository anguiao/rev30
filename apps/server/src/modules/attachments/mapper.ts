import type { Attachment } from '@rev30/contracts'
import { attachments } from '../../db/schema'

export type AttachmentRow = typeof attachments.$inferSelect

export function toAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    originalName: row.originalName,
    mimeType: row.mimeType,
    extension: row.extension,
    size: row.size,
    usage: row.usage as Attachment['usage'],
    createdAt: row.createdAt.toISOString(),
  }
}
