import { createCompactRichTextServerPreset } from '@rev30/rich-text/server/presets'
import { deriveRichTextContent, RichTextContentInvalidError } from '@rev30/rich-text/server'
import { z } from 'zod'
import { AnnouncementContentInvalidError } from './errors'

const attachmentImageSrcPattern = /^\/api\/attachments\/(?<attachmentId>[^/]+)\/content$/
const attachmentIdSchema = z.uuid()

function getAttachmentIdFromImageSrc(src: string) {
  const attachmentId = attachmentImageSrcPattern.exec(src)?.groups?.attachmentId

  return attachmentIdSchema.safeParse(attachmentId).success ? attachmentId : null
}

function collectAnnouncementAttachmentIds(node: unknown, attachmentIds: Set<string>) {
  if (node === null || typeof node !== 'object') {
    return
  }

  const record = node as Record<string, unknown>

  if (record.type === 'image' && record.attrs !== null && typeof record.attrs === 'object') {
    const src = (record.attrs as Record<string, unknown>).src
    const attachmentId = typeof src === 'string' ? getAttachmentIdFromImageSrc(src) : null

    if (attachmentId) {
      attachmentIds.add(attachmentId)
    }
  }

  if (Array.isArray(record.content)) {
    for (const child of record.content) {
      collectAnnouncementAttachmentIds(child, attachmentIds)
    }
  }
}

const announcementRichTextServerPreset = createCompactRichTextServerPreset({
  image: {
    isAllowedSrc(src) {
      return getAttachmentIdFromImageSrc(src) !== null
    },
  },
})

export function deriveAnnouncementContent(contentJson: unknown) {
  try {
    return deriveRichTextContent(contentJson, announcementRichTextServerPreset)
  } catch (error) {
    if (error instanceof RichTextContentInvalidError) {
      throw new AnnouncementContentInvalidError()
    }

    throw error
  }
}

export function extractAnnouncementAttachmentIds(contentJson: unknown) {
  const attachmentIds = new Set<string>()
  collectAnnouncementAttachmentIds(contentJson, attachmentIds)

  return [...attachmentIds]
}
