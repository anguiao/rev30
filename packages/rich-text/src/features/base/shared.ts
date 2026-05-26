import Document from '@tiptap/extension-document'
import Dropcursor from '@tiptap/extension-dropcursor'
import Gapcursor from '@tiptap/extension-gapcursor'
import HardBreak from '@tiptap/extension-hard-break'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { defineRichTextFeature } from '../../core/feature'

export const baseFeature = defineRichTextFeature({
  key: 'base',
  label: '基础结构',
  extension: () => [Document, Paragraph, Text, HardBreak, Dropcursor, Gapcursor],
})
