import { defineRichTextServerFeature } from '../../server/feature'
import type { RichTextHtmlPolicy } from '../../server/policy'
import { blockquoteFeature } from './shared'

export const blockquoteHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['blockquote'],
}

export const blockquoteServerFeature = defineRichTextServerFeature(blockquoteFeature, {
  htmlPolicy: blockquoteHtmlPolicy,
})
