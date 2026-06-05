import { createCompactRichTextServerPreset } from '@rev30/rich-text/server/presets'
import { deriveRichTextContent, RichTextContentInvalidError } from '@rev30/rich-text/server'
import { z } from 'zod'
import { AnnouncementContentInvalidError } from './errors'

const attachmentContentUrlPattern = /^\/api\/attachments\/(?<attachmentId>[^/]+)\/content$/
const attachmentContentIdSchema = z.uuid()

function isAllowedAttachmentContentUrl(src: string) {
  const attachmentId = attachmentContentUrlPattern.exec(src)?.groups?.attachmentId

  return attachmentContentIdSchema.safeParse(attachmentId).success
}

const announcementRichTextServerPreset = createCompactRichTextServerPreset({
  image: {
    isAllowedSrc(src) {
      return isAllowedAttachmentContentUrl(src)
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
