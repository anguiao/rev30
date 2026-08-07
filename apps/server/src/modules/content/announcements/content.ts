import { createStandardRichTextServerPreset } from '@rev30/rich-text/server/presets/standard'
import { deriveRichTextContent, RichTextContentInvalidError } from '@rev30/rich-text/server'
import { z } from 'zod'
import { AnnouncementContentInvalidError } from './errors'

const announcementContentImageSrcPattern = /^\/api\/attachments\/(?<attachmentId>[^/]+)\/content$/
const announcementContentImageIdSchema = z.uuid()

function attachmentIdFromAnnouncementContentImageSrc(src: string) {
  const match = announcementContentImageSrcPattern.exec(src)
  const attachmentId = match?.groups?.attachmentId

  if (match?.[0] !== src || attachmentId === undefined) {
    return undefined
  }

  return announcementContentImageIdSchema.safeParse(attachmentId).success ? attachmentId : undefined
}

function isAllowedAnnouncementContentImageSrc(src: string) {
  return attachmentIdFromAnnouncementContentImageSrc(src) !== undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function extractAnnouncementContentImageAttachmentIds(contentJson: unknown) {
  const attachmentIds = new Set<string>()

  function visit(node: unknown) {
    if (!isRecord(node)) {
      return
    }

    if (node.type === 'image' && isRecord(node.attrs) && typeof node.attrs.src === 'string') {
      const attachmentId = attachmentIdFromAnnouncementContentImageSrc(node.attrs.src)

      if (attachmentId !== undefined) {
        attachmentIds.add(attachmentId)
      }
    }

    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        visit(child)
      }
    }
  }

  visit(contentJson)

  return [...attachmentIds]
}

const announcementRichTextServerPreset = createStandardRichTextServerPreset({
  image: {
    isAllowedSrc: isAllowedAnnouncementContentImageSrc,
  },
})

export function deriveAnnouncementContent(contentJson: unknown) {
  try {
    const content = deriveRichTextContent(contentJson, announcementRichTextServerPreset)

    return {
      ...content,
      attachmentIds: extractAnnouncementContentImageAttachmentIds(content.json),
    }
  } catch (error) {
    if (error instanceof RichTextContentInvalidError) {
      throw new AnnouncementContentInvalidError()
    }

    throw error
  }
}
