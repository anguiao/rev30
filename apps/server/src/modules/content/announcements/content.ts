import { compactRichTextPreset } from '@rev30/rich-text/presets'
import { deriveRichTextContent, RichTextContentInvalidError } from '@rev30/rich-text/server'
import { AnnouncementContentInvalidError } from './errors'

export function deriveAnnouncementContent(contentJson: unknown) {
  try {
    return deriveRichTextContent(contentJson, { preset: compactRichTextPreset })
  } catch (error) {
    if (error instanceof RichTextContentInvalidError) {
      throw new AnnouncementContentInvalidError()
    }

    throw error
  }
}
