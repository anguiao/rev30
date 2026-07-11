import type { AnyExtension, JSONContent, TextSerializer } from '@tiptap/core'
import { getSchema, getText, getTextSerializersFromSchema } from '@tiptap/core'
import { generateHTML } from '@tiptap/html/server'
import { Node as ProseMirrorNode, type Schema } from '@tiptap/pm/model'
import { collectRichTextDocumentExtensions } from '../core/preset'
import { hasRichTextContent, type RichTextDocument } from '../schema'
import { RichTextContentInvalidError } from './errors'
import type { RichTextServerPreset } from './presets/types'
import { createRichTextHtmlSanitizer } from './sanitize'

interface RichTextServerRuntime {
  schema: Schema
  extensions: AnyExtension[]
  textSerializers: Record<string, TextSerializer>
  sanitizeHtml: (html: string) => string
}

const serverRuntimeCache = new WeakMap<RichTextServerPreset, RichTextServerRuntime>()

function getServerRuntime(preset: RichTextServerPreset): RichTextServerRuntime {
  const cachedRuntime = serverRuntimeCache.get(preset)

  if (cachedRuntime) {
    return cachedRuntime
  }

  const extensions = collectRichTextDocumentExtensions(preset)
  const schema = getSchema(extensions)
  const runtime = {
    schema,
    extensions,
    textSerializers: getTextSerializersFromSchema(schema),
    sanitizeHtml: createRichTextHtmlSanitizer(preset.htmlPolicies),
  }
  serverRuntimeCache.set(preset, runtime)

  return runtime
}

export function deriveRichTextContent(contentJson: unknown, preset: RichTextServerPreset) {
  const runtime = getServerRuntime(preset)
  let document: ProseMirrorNode

  try {
    document = ProseMirrorNode.fromJSON(runtime.schema, contentJson)

    if (document.type !== runtime.schema.topNodeType) {
      throw new RangeError('Rich text content must use the schema top node')
    }

    document.check()
  } catch {
    throw new RichTextContentInvalidError()
  }

  const json = document.toJSON() as JSONContent & RichTextDocument
  const text = getText(document, { textSerializers: runtime.textSerializers }).trim()

  if (!hasRichTextContent(json)) {
    throw new RichTextContentInvalidError()
  }

  const html = generateHTML(json, runtime.extensions)

  return {
    json,
    text,
    html: runtime.sanitizeHtml(html),
  }
}
