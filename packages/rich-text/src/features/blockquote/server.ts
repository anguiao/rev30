import { defineRichTextServerFeature } from '../../server/feature'
import type { RichTextHtmlPolicy } from '../../server/sanitize'
import { blockquoteFeature } from './core/feature'

export const blockquoteHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['blockquote'],
}

export const blockquoteServerFeature = defineRichTextServerFeature(blockquoteFeature, {
  htmlPolicy: blockquoteHtmlPolicy,
})
