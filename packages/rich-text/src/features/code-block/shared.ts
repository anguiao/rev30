import { defineRichTextFeature } from '../../core/feature'
import { baseFeature } from '../base/shared'

export const codeBlockFeature = defineRichTextFeature({
  key: 'code-block',
  editorImplementation: true,
  serverImplementation: true,
  dependencies: [baseFeature],
})
