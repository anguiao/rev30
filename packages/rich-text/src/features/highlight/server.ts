import type sanitizeHtml from 'sanitize-html'
import type { RichTextHtmlPolicy } from '../../server/policy'

const highlightColors = ['#fef08a', '#bbf7d0', '#bfdbfe', '#fbcfe8'] as const

const highlightColorSet = new Set<string>(highlightColors)

function normalizeHighlightColor(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim().toLowerCase()

  return highlightColorSet.has(normalized) ? normalized : null
}

function getInlineStyleValue(style: unknown, property: 'background-color' | 'color') {
  if (typeof style !== 'string') {
    return null
  }

  const match = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'i').exec(style)

  return match?.[1]?.trim() ?? null
}

function buildHighlightStyle(color: string, keepInheritColor: boolean) {
  return keepInheritColor ? `background-color: ${color}; color: inherit` : `background-color: ${color}`
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

  const keepInheritColor = getInlineStyleValue(attribs.style, 'color')?.toLowerCase() === 'inherit'

  return {
    tagName,
    attribs: {
      'data-color': color,
      style: buildHighlightStyle(color, keepInheritColor),
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
      'background-color': highlightColors.map((color) => new RegExp(`^${color}$`, 'i')),
      color: [/^inherit$/],
    },
  },
  transformTags: {
    mark: transformMark,
  },
}
