import Code from '@tiptap/extension-code'
import { defineRichTextFeature } from '../../core/feature'

export const codeFeature = defineRichTextFeature({
  key: 'code',
  label: '行内代码',
  icon: 'i-[lucide--code]',
  extension: () => Code,
})
