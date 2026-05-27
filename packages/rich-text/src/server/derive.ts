import type { AnyExtension } from '@tiptap/core'
import { getSchema } from '@tiptap/core'
import { generateHTML } from '@tiptap/html/server'
import { Node as ProseMirrorNode, type Schema } from '@tiptap/pm/model'
import { collectRichTextExtensions } from '../core/preset'
import { RichTextContentInvalidError } from './errors'
import type { RichTextHtmlPolicy } from './policy'
import type { RichTextServerPreset } from './presets/types'
import { sanitizeRichTextHtml } from './sanitize'

interface RichTextServerRuntime {
  schema: Schema
  extensions: AnyExtension[]
  htmlPolicies: RichTextHtmlPolicy[]
}

const serverRuntimeCache = new WeakMap<RichTextServerPreset, RichTextServerRuntime>()

function getServerRuntime(preset: RichTextServerPreset): RichTextServerRuntime {
  const cachedRuntime = serverRuntimeCache.get(preset)

  if (cachedRuntime) {
    return cachedRuntime
  }

  const extensions = collectRichTextExtensions(preset.preset)
  const runtime = {
    schema: getSchema(extensions),
    extensions,
    htmlPolicies: preset.htmlPolicies,
  }
  serverRuntimeCache.set(preset, runtime)

  return runtime
}

export function deriveRichTextContent(contentJson: unknown, preset: RichTextServerPreset) {
  const runtime = getServerRuntime(preset)
  let document: ProseMirrorNode

  try {
    document = ProseMirrorNode.fromJSON(runtime.schema, contentJson)
  } catch {
    throw new RichTextContentInvalidError()
  }

  const text = document.textBetween(0, document.content.size, '\n\n').trim()

  if (text.length === 0) {
    throw new RichTextContentInvalidError()
  }

  const html = generateHTML(document.toJSON(), runtime.extensions)

  return {
    text,
    html: sanitizeRichTextHtml(html, runtime.htmlPolicies),
  }
}
