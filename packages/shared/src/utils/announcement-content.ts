import { getSchema } from '@tiptap/core'
import { Node as ProseMirrorNode } from '@tiptap/pm/model'
import StarterKit from '@tiptap/starter-kit'

const announcementExtensions = [
  StarterKit.configure({
    heading: {
      levels: [1, 2, 3],
    },
    link: {
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
    },
    underline: {},
  }),
]

const announcementSchema = getSchema(announcementExtensions)

export type AnnouncementContentParseResult =
  | { success: true; text: string }
  | { success: false; reason: 'empty' | 'invalid' }

export function parseAnnouncementContent(contentJson: unknown): AnnouncementContentParseResult {
  try {
    const document = ProseMirrorNode.fromJSON(announcementSchema, contentJson)
    const text = document.textBetween(0, document.content.size, '\n\n').trim()

    if (text.length === 0) {
      return {
        success: false,
        reason: 'empty',
      }
    }

    return {
      success: true,
      text,
    }
  } catch {
    return {
      success: false,
      reason: 'invalid',
    }
  }
}
