import Blockquote from '@tiptap/extension-blockquote'
import { defineRichTextFeature } from '../../core/feature'

export const blockquoteFeature = defineRichTextFeature({
  key: 'blockquote',
  editorImplementation: true,
  serverImplementation: true,
  documentExtensions: () => [Blockquote],
})
