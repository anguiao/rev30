import { getSchema } from '@tiptap/core'
import { Node as ProseMirrorNode, type Schema } from '@tiptap/pm/model'
import StarterKit from '@tiptap/starter-kit'
import { AnnouncementContentInvalidError, AnnouncementEmptyContentError } from './errors'

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

export function deriveAnnouncementContentText(contentJson: unknown) {
  try {
    const document = ProseMirrorNode.fromJSON(getAnnouncementSchema(), contentJson)
    const text = document.textBetween(0, document.content.size, '\n\n').trim()

    if (text.length === 0) {
      throw new AnnouncementEmptyContentError()
    }

    return text
  } catch (error) {
    if (error instanceof AnnouncementEmptyContentError) {
      throw error
    }

    throw new AnnouncementContentInvalidError()
  }
}
