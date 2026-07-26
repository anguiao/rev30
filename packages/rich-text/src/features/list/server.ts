import { defineRichTextServerFeature } from '../../server/feature'
import type { RichTextHtmlPolicy, RichTextTagTransform } from '../../server/sanitize'
import { listFeature } from './shared'

const orderedListTypes = new Set(['1', 'a', 'A', 'i', 'I'])

function normalizeOrderedListStart(value: string | undefined) {
  if (!value || !/^-?\d+$/.test(value)) {
    return undefined
  }

  const start = Number(value)

  return Number.isSafeInteger(start) ? String(start) : undefined
}

const transformOrderedList: RichTextTagTransform = ({ tagName, attribs }) => {
  const start = normalizeOrderedListStart(attribs.start)
  const type = attribs.type && orderedListTypes.has(attribs.type) ? attribs.type : undefined

  return {
    tagName,
    attribs: {
      ...(start ? { start } : {}),
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
