import { defineRichTextServerFeature } from '../../server/feature'
import type { RichTextHtmlPolicy, RichTextTagTransform } from '../../server/sanitize'
import { normalizeOrderedListStart, normalizeOrderedListType } from './core/attrs'
import { listFeature } from './core/feature'

const transformOrderedList: RichTextTagTransform = ({ tagName, attribs }) => {
  const start = normalizeOrderedListStart(attribs.start)
  const type = normalizeOrderedListType(attribs.type)

  return {
    tagName,
    attribs: {
      ...(start === null ? {} : { start: String(start) }),
      ...(type ? { type } : {}),
    },
  }
}

export const listHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['ul', 'ol', 'li'],
  allowedAttributes: {
    ol: ['start', 'type'],
  },
  transformTags: {
    ol: [transformOrderedList],
  },
}

export const listServerFeature = defineRichTextServerFeature(listFeature, {
  htmlPolicy: listHtmlPolicy,
})
