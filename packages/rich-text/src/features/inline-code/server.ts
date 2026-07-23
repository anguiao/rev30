import { defineRichTextServerFeature } from '../../server/feature'
import type { RichTextHtmlPolicy } from '../../server/sanitize'
import { inlineCodeFeature } from './shared'

export const inlineCodeHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['code'],
}

export const inlineCodeServerFeature = defineRichTextServerFeature(inlineCodeFeature, {
  htmlPolicy: inlineCodeHtmlPolicy,
})
