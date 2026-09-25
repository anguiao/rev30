import { getSchema, getText, getTextSerializersFromSchema } from '@tiptap/core'
import { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { renderToHTMLString } from '@tiptap/static-renderer/pm/html-string'
import type { RichTextDocument, RichTextJsonNode } from '../core/schema'
import { RichTextContentInvalidError, RichTextDocumentInvalidError } from './errors'
import { collectRichTextServerExtensions } from './feature'
import type { RichTextServerPreset } from './preset'
import { sanitizeRichTextHtml } from './sanitize'

const MAX_DOCUMENT_DEPTH = 100
const MAX_DOCUMENT_NODE_COUNT = 100_000

function assertRichTextDocumentBudget(contentJson: unknown) {
  const pending = [{ node: contentJson, depth: 1 }]
  let visitedNodeCount = 0

  while (pending.length > 0) {
    const { node, depth } = pending.pop()!
    visitedNodeCount += 1

    if (depth > MAX_DOCUMENT_DEPTH) {
      throw new RichTextDocumentInvalidError('Rich text document exceeds the depth limit')
    }

    if (node === null || typeof node !== 'object' || !('content' in node)) {
      continue
    }

    const { content } = node

    if (!Array.isArray(content)) {
      continue
    }

    if (content.length > MAX_DOCUMENT_NODE_COUNT - visitedNodeCount - pending.length) {
      throw new RichTextDocumentInvalidError('Rich text document exceeds the node count limit')
    }

    for (const child of content) {
      pending.push({ node: child, depth: depth + 1 })
    }
  }
}

export function deriveRichTextContent(contentJson: unknown, preset: RichTextServerPreset) {
  const extensions = collectRichTextServerExtensions(preset)
  const schema = getSchema(extensions)
  let document: ProseMirrorNode

  try {
    assertRichTextDocumentBudget(contentJson)
    document = ProseMirrorNode.fromJSON(schema, contentJson)

    if (document.type !== schema.topNodeType) {
      throw new RangeError('Rich text content must use the schema top node')
    }

    document.check()
  } catch (cause) {
    throw new RichTextContentInvalidError({ cause })
  }

  try {
    for (const { assertDocument } of preset.serverFeatures) {
      assertDocument?.(document)
    }
  } catch (cause) {
    if (cause instanceof RichTextDocumentInvalidError) {
      throw new RichTextContentInvalidError({ cause })
    }

    throw cause
  }

  const json: RichTextDocument & RichTextJsonNode = document.toJSON()
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
