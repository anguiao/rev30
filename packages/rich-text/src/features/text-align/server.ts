import { defineRichTextServerFeature } from '../../server/feature'
import type { RichTextHtmlPolicy, RichTextTagTransform } from '../../server/policy'
import { textAlignments, type TextAlignment } from './alignments'
import { textAlignFeature } from './shared'

const textAlignTags = ['p', 'h1', 'h2', 'h3'] as const
const textAlignSet = new Set<string>(textAlignments)

function createExactStyleValuePattern(value: string) {
  const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  return new RegExp(`^${escapedValue}$`, 'i')
}

function normalizeTextAlign(value: string | undefined): TextAlignment | undefined {
  const normalized = value?.trim().toLowerCase()

  return normalized && textAlignSet.has(normalized) ? (normalized as TextAlignment) : undefined
}

function getInlineStyleValue(style: string | undefined, property: 'text-align') {
  if (!style) {
    return undefined
  }

  const match = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'i').exec(style)

  return match?.[1]?.trim()
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
        'text-align': textAlignments.map(createExactStyleValuePattern),
      },
    ]),
  ),
  transformTags: Object.fromEntries(textAlignTags.map((tag) => [tag, [transformTextBlock]])),
}

export const textAlignServerFeature = defineRichTextServerFeature(textAlignFeature, {
  htmlPolicy: textAlignHtmlPolicy,
})
