import { defineRichTextServerFeature } from '../../server/feature'
import {
  getInlineStyleValue,
  type RichTextHtmlPolicy,
  type RichTextTagTransform,
} from '../../server/sanitize'
import { highlightColors } from './colors'
import { highlightFeature } from './shared'

const highlightColorSet = new Set<string>(highlightColors)

function normalizeHighlightColor(value: string | undefined) {
  const normalized = value?.trim().toLowerCase()

  return normalized && highlightColorSet.has(normalized) ? normalized : undefined
}

function buildHighlightStyle(color: string) {
  return `background-color: ${color}; color: inherit`
}

const transformMark: RichTextTagTransform = ({ tagName, attribs }) => {
  const color =
    normalizeHighlightColor(attribs['data-color']) ??
    normalizeHighlightColor(getInlineStyleValue(attribs.style, 'background-color'))

  if (!color) {
    return {
      tagName,
      attribs: {},
    }
  }

  return {
    tagName,
    attribs: {
      'data-color': color,
      style: buildHighlightStyle(color),
    },
  }
}

export const highlightHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['mark'],
  allowedAttributes: {
    mark: ['data-color', 'style'],
  },
  allowedStyles: {
    mark: {
      'background-color': [/^.+$/],
      color: [/^.+$/],
    },
  },
  transformTags: {
    mark: [transformMark],
  },
}

export const highlightServerFeature = defineRichTextServerFeature(highlightFeature, {
  htmlPolicy: highlightHtmlPolicy,
})
