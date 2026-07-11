import Italic from '@tiptap/extension-italic'
import { defineRichTextFeature } from '../../core/feature'

export const italicFeature = defineRichTextFeature({
  key: 'italic',
  editorImplementation: true,
  serverImplementation: true,
  documentExtensions: () => [Italic],
})
