import { defineRichTextFeature } from '../../core/feature'
import { baseFeature } from '../base/shared'

export const searchReplaceFeature = defineRichTextFeature({
  key: 'search-replace',
  editorImplementation: true,
  serverImplementation: false,
  dependencies: [baseFeature],
})
