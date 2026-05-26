import Underline from '@tiptap/extension-underline'
import { defineRichTextFeature } from '../../core/feature'

export const underlineFeature = defineRichTextFeature({
  key: 'underline',
  label: '下划线',
  icon: 'i-[lucide--underline]',
  extension: () => Underline,
})
