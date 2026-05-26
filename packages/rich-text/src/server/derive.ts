import type { AnyExtension } from '@tiptap/core'
import { getSchema } from '@tiptap/core'
import { generateHTML } from '@tiptap/html/server'
import { Node as ProseMirrorNode, type Schema } from '@tiptap/pm/model'
import { collectRichTextExtensions, type RichTextPreset } from '../core/preset'
import { RichTextContentInvalidError } from './errors'
import { getRichTextHtmlPolicies, type RichTextRuntimePolicy } from './registry'
import { sanitizeRichTextHtml } from './sanitize'

interface PresetRuntimeSnapshot {
  schema: Schema
  extensions: AnyExtension[]
  policies: RichTextRuntimePolicy[]
}

const presetRuntimeCache = new WeakMap<RichTextPreset, PresetRuntimeSnapshot>()

export interface DeriveRichTextContentOptions {
  preset: RichTextPreset
}

export interface DerivedRichTextContent {
  text: string
  html: string
}

function getPresetRuntime(preset: RichTextPreset): PresetRuntimeSnapshot {
  const cachedRuntime = presetRuntimeCache.get(preset)

  if (cachedRuntime) {
    return cachedRuntime
  }

  const extensions = collectRichTextExtensions(preset)
  const runtimeSnapshot = {
    schema: getSchema(extensions),
    extensions,
    policies: getRichTextHtmlPolicies(preset),
  }
  presetRuntimeCache.set(preset, runtimeSnapshot)

  return runtimeSnapshot
}

export function deriveRichTextContent(
  contentJson: unknown,
  { preset }: DeriveRichTextContentOptions,
): DerivedRichTextContent {
  const runtime = getPresetRuntime(preset)
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
    html: sanitizeRichTextHtml(html, runtime.policies),
  }
}
