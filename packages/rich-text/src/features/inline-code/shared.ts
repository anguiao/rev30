import Code from '@tiptap/extension-code'
import { defineRichTextFeature } from '../../core/feature'

export const inlineCodeFeature = defineRichTextFeature({
  key: 'inline-code',
  editorImplementation: true,
  serverImplementation: true,
  documentExtensions: () => [Code],
})
