import { defineRichTextFeature } from '../../core/feature'

export const removeFormatFeature = defineRichTextFeature({
  key: 'remove-format',
  editorImplementation: true,
  serverImplementation: false,
})
