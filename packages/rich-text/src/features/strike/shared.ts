import Strike from '@tiptap/extension-strike'
import { defineRichTextFeature } from '../../core/feature'

export const strikeFeature = defineRichTextFeature({
  key: 'strike',
  label: '删除线',
  icon: 'i-[lucide--strikethrough]',
  extension: () => Strike,
})
