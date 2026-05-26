import { getSchema } from '@tiptap/core'
import { generateHTML } from '@tiptap/html/server'
import { Node as ProseMirrorNode, type Schema } from '@tiptap/pm/model'
import { collectRichTextExtensions, type RichTextPreset } from '../core/preset'
import { RichTextContentInvalidError } from './errors'
import { getRichTextHtmlPolicies } from './registry'
import { sanitizeRichTextHtml } from './sanitize'

const presetSchemaCache = new WeakMap<RichTextPreset, Schema>()

export interface DeriveRichTextContentOptions {
  preset: RichTextPreset
}

export interface DerivedRichTextContent {
  text: string
  html: string
}

function getPresetSchema(preset: RichTextPreset) {
  const cachedSchema = presetSchemaCache.get(preset)

  if (cachedSchema) {
    return cachedSchema
  }

  const schema = getSchema(collectRichTextExtensions(preset))
  presetSchemaCache.set(preset, schema)

  return schema
}

export function deriveRichTextContent(
  contentJson: unknown,
  { preset }: DeriveRichTextContentOptions,
): DerivedRichTextContent {
  try {
    const document = ProseMirrorNode.fromJSON(getPresetSchema(preset), contentJson)
    const text = document.textBetween(0, document.content.size, '\n\n').trim()

    if (text.length === 0) {
      throw new RichTextContentInvalidError()
    }

    const html = generateHTML(document.toJSON(), collectRichTextExtensions(preset))

    return {
      text,
      html: sanitizeRichTextHtml(html, getRichTextHtmlPolicies(preset)),
    }
  } catch (error) {
    if (error instanceof RichTextContentInvalidError) {
      throw error
    }

    throw new RichTextContentInvalidError()
  }
}
