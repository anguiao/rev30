import { getSchema } from '@tiptap/core'
import { generateHTML } from '@tiptap/html/server'
import { Node as ProseMirrorNode, type Schema } from '@tiptap/pm/model'
import StarterKit from '@tiptap/starter-kit'
import sanitizeHtml from 'sanitize-html'
import { AnnouncementContentInvalidError, AnnouncementEmptyContentError } from './errors'

let announcementSchema: Schema | undefined

const SAFE_LINK_TARGET = '_blank'
const SAFE_LINK_REL = 'noopener noreferrer nofollow'

function getAnnouncementExtensions() {
  return [
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
}

function getAnnouncementSchema() {
  announcementSchema ??= getSchema(getAnnouncementExtensions())

  return announcementSchema
}

function sanitizeAnnouncementHtml(html: string) {
  return sanitizeHtml(html, {
    allowedTags: [
      'p',
      'h1',
      'h2',
      'h3',
      'strong',
      'em',
      'u',
      's',
      'blockquote',
      'ul',
      'ol',
      'li',
      'hr',
      'br',
      'a',
      'code',
      'pre',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowProtocolRelative: false,
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: 'a',
        attribs: {
          ...attribs,
          target: SAFE_LINK_TARGET,
          rel: SAFE_LINK_REL,
        },
      }),
    },
  })
}

export function deriveAnnouncementContent(contentJson: unknown) {
  try {
    const document = ProseMirrorNode.fromJSON(getAnnouncementSchema(), contentJson)
    const text = document.textBetween(0, document.content.size, '\n\n').trim()

    if (text.length === 0) {
      throw new AnnouncementEmptyContentError()
    }

    return {
      text,
      html: sanitizeAnnouncementHtml(generateHTML(document.toJSON(), getAnnouncementExtensions())),
    }
  } catch (error) {
    if (error instanceof AnnouncementEmptyContentError) {
      throw error
    }

    throw new AnnouncementContentInvalidError()
  }
}
