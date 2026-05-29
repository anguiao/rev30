import type sanitizeHtml from 'sanitize-html'
import type { RichTextHtmlPolicy } from '../../server/policy'
import { highlightColors } from './colors'

const highlightColorSet = new Set<string>(highlightColors)

function createExactStyleValuePattern(value: string) {
  const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  return new RegExp(`^${escapedValue}$`, 'i')
}

function normalizeHighlightColor(value: string | undefined) {
  const normalized = value?.trim().toLowerCase()

  return normalized && highlightColorSet.has(normalized) ? normalized : undefined
}

function getInlineStyleValue(style: string | undefined, property: 'background-color' | 'color') {
  if (!style) {
    return undefined
  }

  const match = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'i').exec(style)

  return match?.[1]?.trim()
}

function buildHighlightStyle(color: string) {
  return `background-color: ${color}; color: inherit`
}

const transformMark: sanitizeHtml.Transformer = (tagName, attribs) => {
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
      'background-color': highlightColors.map(createExactStyleValuePattern),
      color: [/^inherit$/],
    },
  },
  transformTags: {
    mark: transformMark,
  },
}
