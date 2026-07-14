import { defineRichTextFeature } from '../../core/feature'

export const characterCountFeature = defineRichTextFeature({
  key: 'character-count',
  editorImplementation: true,
  serverImplementation: false,
})
