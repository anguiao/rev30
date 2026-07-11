import CodeBlock from '@tiptap/extension-code-block'
import { defineRichTextFeature } from '../../core/feature'
import { baseFeature } from '../base/shared'

const RichTextCodeBlock = CodeBlock.extend({
  addAttributes() {
    return {}
  },
})

export const codeBlockFeature = defineRichTextFeature({
  key: 'code-block',
  editorImplementation: true,
  serverImplementation: true,
  dependencies: [baseFeature],
  documentExtensions: () => [RichTextCodeBlock],
})
