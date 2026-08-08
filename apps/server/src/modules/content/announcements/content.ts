import type { RichTextJsonNode } from '@rev30/rich-text/schema'
import { createStandardRichTextServerPreset } from '@rev30/rich-text/server/presets/standard'
import { deriveRichTextContent, RichTextContentInvalidError } from '@rev30/rich-text/server'
import { z } from 'zod'
import { AnnouncementContentInvalidError } from './errors'

const imageSrcPattern = /^\/api\/attachments\/(?<attachmentId>[^/]+)\/content$/
const imageAttachmentIdSchema = z.uuid()

function parseImageAttachmentId(src: string) {
  const match = imageSrcPattern.exec(src)
  const attachmentId = match?.groups?.attachmentId

  if (match?.[0] !== src || attachmentId === undefined) {
    return undefined
  }

  const result = imageAttachmentIdSchema.safeParse(attachmentId)

  return result.success ? result.data.toLowerCase() : undefined
}

function extractAnnouncementContentImageAttachmentIds(contentJson: RichTextJsonNode) {
  const attachmentIds = new Set<string>()

  function visit(node: RichTextJsonNode) {
    const src = node.attrs?.src

    if (node.type === 'image' && typeof src === 'string') {
      const attachmentId = parseImageAttachmentId(src)

      if (attachmentId !== undefined) {
        attachmentIds.add(attachmentId)
      }
    }

    for (const child of node.content ?? []) {
      visit(child)
    }
  }

  visit(contentJson)

  return [...attachmentIds]
}

const announcementRichTextServerPreset = createStandardRichTextServerPreset({
  image: {
    isAllowedSrc: (src) => parseImageAttachmentId(src) !== undefined,
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
