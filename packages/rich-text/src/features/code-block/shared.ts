import CodeBlock from '@tiptap/extension-code-block'
import { defineRichTextFeature } from '../../core/feature'

export const codeBlockFeature = defineRichTextFeature({
  key: 'code-block',
  label: '代码块',
  icon: 'i-[lucide--square-code]',
  extension: () => CodeBlock,
})
