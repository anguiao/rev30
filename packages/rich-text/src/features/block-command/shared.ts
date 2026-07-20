import { defineRichTextFeature } from '../../core/feature'

export const blockCommandFeature = defineRichTextFeature({
  key: 'block-command',
  editorImplementation: true,
  serverImplementation: false,
})
