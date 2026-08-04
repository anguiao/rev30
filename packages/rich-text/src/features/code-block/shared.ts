import { defineRichTextFeature } from '../../core/feature'

export const codeBlockFeature = defineRichTextFeature({
  key: 'code-block',
  editorImplementation: true,
  serverImplementation: true,
})
