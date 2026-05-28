import { Highlight } from '@tiptap/extension-highlight'
import { defineRichTextFeature } from '../../core/feature'

export const highlightFeature = defineRichTextFeature({
  key: 'highlight',
  extension: () =>
    Highlight.configure({
      multicolor: true,
    }),
})
