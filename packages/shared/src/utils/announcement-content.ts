import { getSchema } from '@tiptap/core'
import { Node as ProseMirrorNode, type Schema } from '@tiptap/pm/model'
import StarterKit from '@tiptap/starter-kit'

let announcementSchema: Schema | undefined

function getAnnouncementSchema() {
  announcementSchema ??= getSchema([
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
  ])

  return announcementSchema
}

export type AnnouncementContentParseResult =
  | { success: true; text: string }
  | { success: false; reason: 'empty' | 'invalid' }

export function parseAnnouncementContent(contentJson: unknown): AnnouncementContentParseResult {
  try {
    const document = ProseMirrorNode.fromJSON(getAnnouncementSchema(), contentJson)
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
