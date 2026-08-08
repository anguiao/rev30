import { defineRichTextServerFeature } from '../../../server/feature'
import {
  getInlineStyleValue,
  type RichTextHtmlPolicy,
  type RichTextTagTransform,
} from '../../../server/sanitize'
import { textAlignments, type TextAlignment } from '../core/alignments'
import { textAlignFeature } from '../core/feature'

const textAlignTags = ['p', 'h1', 'h2', 'h3'] as const
const textAlignSet = new Set<string>(textAlignments)

function normalizeTextAlign(value: string | undefined): TextAlignment | undefined {
  const normalized = value?.trim().toLowerCase()

  return normalized && textAlignSet.has(normalized) ? (normalized as TextAlignment) : undefined
}

function buildTextAlignStyle(alignment: TextAlignment) {
  return `text-align: ${alignment}`
}

const transformTextBlock: RichTextTagTransform = ({ tagName, attribs }) => {
  const alignment = normalizeTextAlign(getInlineStyleValue(attribs.style, 'text-align'))

  return {
    tagName,
    attribs: alignment ? { style: buildTextAlignStyle(alignment) } : {},
  }
}

export const textAlignHtmlPolicy: RichTextHtmlPolicy = {
  allowedAttributes: Object.fromEntries(textAlignTags.map((tag) => [tag, ['style']])),
  allowedStyles: Object.fromEntries(
    textAlignTags.map((tag) => [
      tag,
      {
        'text-align': [/^.+$/],
      },
    ]),
  ),
  transformTags: Object.fromEntries(textAlignTags.map((tag) => [tag, [transformTextBlock]])),
}

export const textAlignServerFeature = defineRichTextServerFeature(textAlignFeature, {
  htmlPolicy: textAlignHtmlPolicy,
})
