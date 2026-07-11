import { defineRichTextFeature } from '../../core/feature'
import { baseFeature } from '../base/shared'

export const characterCountFeature = defineRichTextFeature({
  key: 'character-count',
  editorImplementation: true,
  serverImplementation: false,
  dependencies: [baseFeature],
})
