import { defineRichTextServerFeature } from '../../server/feature'
import type { RichTextHtmlPolicy } from '../../server/policy'
import { strikeFeature } from './shared'

export const strikeHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['s'],
}

export const strikeServerFeature = defineRichTextServerFeature(strikeFeature, {
  htmlPolicy: strikeHtmlPolicy,
})
