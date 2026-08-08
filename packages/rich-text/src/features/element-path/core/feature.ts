import { defineRichTextFeature } from '../../../core/feature'

export const elementPathFeature = defineRichTextFeature({
  key: 'element-path',
  editorImplementation: true,
  serverImplementation: false,
})
