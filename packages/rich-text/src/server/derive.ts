import { getSchema, getText, getTextSerializersFromSchema } from '@tiptap/core'
import { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { renderToHTMLString } from '@tiptap/static-renderer/pm/html-string'
import type { RichTextDocument } from '../schema'
import { RichTextContentInvalidError } from './errors'
import { collectRichTextServerExtensions } from './feature'
import type { RichTextServerPreset } from './presets/types'
import { sanitizeRichTextHtml } from './sanitize'

export function deriveRichTextContent(contentJson: unknown, preset: RichTextServerPreset) {
  const extensions = collectRichTextServerExtensions(preset)
  const schema = getSchema(extensions)
  let document: ProseMirrorNode

  try {
    document = ProseMirrorNode.fromJSON(schema, contentJson)

    if (document.type !== schema.topNodeType) {
      throw new RangeError('Rich text content must use the schema top node')
    }

    document.check()
  } catch {
    throw new RichTextContentInvalidError()
  }

  const json: RichTextDocument = document.toJSON()
  const text = getText(document, {
    textSerializers: getTextSerializersFromSchema(schema),
  }).trim()

  const html = renderToHTMLString({
    content: document,
    extensions,
  })

  return {
    json,
    text,
    html: sanitizeRichTextHtml(
      html,
      preset.serverFeatures.map(({ htmlPolicy }) => htmlPolicy),
    ),
  }
}
