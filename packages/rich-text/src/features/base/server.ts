import { defineRichTextServerFeature } from '../../server/feature'
import type { RichTextHtmlPolicy } from '../../server/policy'
import { baseFeature } from './shared'

export const baseHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['p', 'br'],
}

export const baseServerFeature = defineRichTextServerFeature(baseFeature, {
  htmlPolicy: baseHtmlPolicy,
})
