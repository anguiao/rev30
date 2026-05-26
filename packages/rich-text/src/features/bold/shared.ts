import Bold from '@tiptap/extension-bold'
import { defineRichTextFeature } from '../../core/feature'

export const boldFeature = defineRichTextFeature({
  key: 'bold',
  label: '加粗',
  icon: 'i-[lucide--bold]',
  extension: () => Bold,
})
