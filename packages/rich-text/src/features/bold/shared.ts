import Bold from '@tiptap/extension-bold'
import { defineRichTextFeature } from '../../core/feature'

export const boldFeature = defineRichTextFeature({
  key: 'bold',
  editorImplementation: true,
  serverImplementation: true,
  documentExtensions: () => [Bold],
})
