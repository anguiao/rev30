import Strike from '@tiptap/extension-strike'
import { defineRichTextFeature } from '../../core/feature'

export const strikeFeature = defineRichTextFeature({
  key: 'strike',
  editorImplementation: true,
  serverImplementation: true,
  documentExtensions: () => [Strike],
})
