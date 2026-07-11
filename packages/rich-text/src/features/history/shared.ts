import { defineRichTextFeature } from '../../core/feature'

export const historyFeature = defineRichTextFeature({
  key: 'history',
  editorImplementation: true,
  serverImplementation: false,
})
