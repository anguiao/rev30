import type { Attachment, AttachmentListItem } from '@rev30/contracts'
import { toIsoDateTime } from '@rev30/utils'
import { attachments, systemUsers } from '../../db/schema'

export type AttachmentRow = typeof attachments.$inferSelect
export type AttachmentListEntry = {
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
    createdAt: toIsoDateTime(row.createdAt),
  }
}

export function toAttachmentListItem(entry: AttachmentListEntry): AttachmentListItem {
  return {
    ...toAttachment(entry.attachment),
    createdBy: {
      id: entry.createdBy.id,
      username: entry.createdBy.username,
      nickname: entry.createdBy.nickname,
    },
  }
}
