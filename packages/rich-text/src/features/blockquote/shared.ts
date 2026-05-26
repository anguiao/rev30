import Blockquote from '@tiptap/extension-blockquote'
import { defineRichTextFeature } from '../../core/feature'

export const blockquoteFeature = defineRichTextFeature({
  key: 'blockquote',
  label: '引用',
  icon: 'i-[lucide--quote]',
  extension: () => Blockquote,
})
