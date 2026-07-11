import Underline from '@tiptap/extension-underline'
import { defineRichTextFeature } from '../../core/feature'

export const underlineFeature = defineRichTextFeature({
  key: 'underline',
  editorImplementation: true,
  serverImplementation: true,
  documentExtensions: () => [Underline],
})
