import type { AnyExtension, JSONContent, TextSerializer } from '@tiptap/core'
import { getSchema, getText, getTextSerializersFromSchema } from '@tiptap/core'
import { Node as ProseMirrorNode, type Schema } from '@tiptap/pm/model'
import { renderToHTMLString } from '@tiptap/static-renderer/pm/html-string'
import { hasRichTextContent, type RichTextDocument } from '../schema'
import { RichTextContentInvalidError } from './errors'
import { collectRichTextServerExtensions } from './feature'
import type { RichTextServerPreset } from './presets/types'
import { createRichTextHtmlSanitizer } from './sanitize'

interface RichTextServerRuntime {
  schema: Schema
  extensions: AnyExtension[]
  documentValidators: ((document: ProseMirrorNode) => void)[]
  textSerializers: Record<string, TextSerializer>
  sanitizeHtml: (html: string) => string
}

const serverRuntimeCache = new WeakMap<RichTextServerPreset, RichTextServerRuntime>()

function getServerRuntime(preset: RichTextServerPreset): RichTextServerRuntime {
  const cachedRuntime = serverRuntimeCache.get(preset)

  if (cachedRuntime) {
    return cachedRuntime
  }

  const extensions = collectRichTextServerExtensions(preset)
  const schema = getSchema(extensions)
  const serverFeatureByFeature = new Map(
    preset.serverFeatures.map((serverFeature) => [serverFeature.feature, serverFeature]),
  )
  const runtime = {
    schema,
    extensions,
    documentValidators: preset.features.flatMap((feature) => {
      const validator = serverFeatureByFeature.get(feature)?.validateDocument

      return validator ? [validator] : []
    }),
    textSerializers: getTextSerializersFromSchema(schema),
    sanitizeHtml: createRichTextHtmlSanitizer(
      preset.serverFeatures.map((serverFeature) => serverFeature.htmlPolicy),
    ),
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

    for (const validateDocument of runtime.documentValidators) {
      validateDocument(document)
    }
  } catch {
    throw new RichTextContentInvalidError()
  }

  const json = document.toJSON() as JSONContent & RichTextDocument
  const text = getText(document, { textSerializers: runtime.textSerializers }).trim()

  if (!hasRichTextContent(json)) {
    throw new RichTextContentInvalidError()
  }

  const html = renderToHTMLString({
    content: document,
    extensions: runtime.extensions,
  })

  return {
    json,
    text,
    html: runtime.sanitizeHtml(html),
  }
}
