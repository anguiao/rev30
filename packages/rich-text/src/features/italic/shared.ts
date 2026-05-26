import Italic from '@tiptap/extension-italic'
import { defineRichTextFeature } from '../../core/feature'

export const italicFeature = defineRichTextFeature({
  key: 'italic',
  label: '斜体',
  icon: 'i-[lucide--italic]',
  extension: () => Italic,
})
