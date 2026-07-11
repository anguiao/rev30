import Document from '@tiptap/extension-document'
import HardBreak from '@tiptap/extension-hard-break'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { defineRichTextFeature } from '../../core/feature'

export const baseFeature = defineRichTextFeature({
  key: 'base',
  editorImplementation: true,
  serverImplementation: true,
  documentExtensions: () => [Document, Paragraph, Text, HardBreak],
})
