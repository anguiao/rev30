import { defineRichTextServerFeature } from '../../server/feature'
import {
  getInlineStyleValue,
  type RichTextHtmlPolicy,
  type RichTextTagTransform,
} from '../../server/sanitize'
import { normalizeHighlightColor } from './colors'
import { highlightFeature } from './shared'

const transformMark: RichTextTagTransform = ({ tagName, attribs }) => {
  const color = Object.hasOwn(attribs, 'data-color')
    ? normalizeHighlightColor(attribs['data-color'])
    : normalizeHighlightColor(getInlineStyleValue(attribs.style, 'background-color'))

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
      style: `background-color: ${color}; color: inherit`,
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
