import type { Attachment, AttachmentListItem } from '@rev30/contracts'
import { attachments, systemUsers } from '../../db/schema'

export type AttachmentRow = typeof attachments.$inferSelect
export type AttachmentListRow = {
  attachment: AttachmentRow
  createdBy: Pick<typeof systemUsers.$inferSelect, 'id' | 'username' | 'nickname'>
}

export function toAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    originalName: row.originalName,
    mimeType: row.mimeType,
    extension: row.extension,
    size: row.size,
    usage: row.usage as Attachment['usage'],
    readPolicy: row.readPolicy as Attachment['readPolicy'],
    createdAt: row.createdAt.toISOString(),
  }
}

export function toAttachmentListItem(row: AttachmentListRow): AttachmentListItem {
  return {
    ...toAttachment(row.attachment),
    createdBy: {
      id: row.createdBy.id,
      username: row.createdBy.username,
      nickname: row.createdBy.nickname,
    },
  }
}
