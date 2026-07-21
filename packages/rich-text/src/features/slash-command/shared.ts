import { defineRichTextFeature } from '../../core/feature'

export const slashCommandFeature = defineRichTextFeature({
  key: 'slash-command',
  editorImplementation: true,
  serverImplementation: false,
})
