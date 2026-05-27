import Bold from '@tiptap/extension-bold'
import { defineRichTextFeature } from '../../core/feature'

export const boldFeature = defineRichTextFeature({
  key: 'bold',
  extension: () => Bold,
})
