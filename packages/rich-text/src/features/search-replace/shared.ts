import { defineRichTextFeature } from '../../core/feature'

export const searchReplaceFeature = defineRichTextFeature({
  key: 'search-replace',
  editorImplementation: true,
  serverImplementation: false,
})
