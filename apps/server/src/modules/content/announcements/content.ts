import { createCompactRichTextServerPreset } from '@rev30/rich-text/server/presets'
import { deriveRichTextContent, RichTextContentInvalidError } from '@rev30/rich-text/server'
import { AnnouncementContentInvalidError } from './errors'

const attachmentContentUrlPattern =
  /^\/api\/attachments\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/content$/i

const announcementRichTextServerPreset = createCompactRichTextServerPreset({
  image: {
    isAllowedSrc(src) {
      return attachmentContentUrlPattern.test(src)
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
