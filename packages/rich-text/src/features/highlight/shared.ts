import type { Attributes } from '@tiptap/core'
import { Highlight } from '@tiptap/extension-highlight'
import { defineRichTextFeature } from '../../core/feature'
import { highlightColors } from './colors'

const highlightColorSet = new Set<string>(highlightColors)

function validateHighlightColor(value: unknown) {
  if (value !== null && (typeof value !== 'string' || !highlightColorSet.has(value))) {
    throw new RangeError('Unsupported highlight color')
  }
}

const RichTextHighlight = Highlight.extend({
  addAttributes() {
    const parentAttributes: Attributes = this.parent?.() ?? {}

    return {
      ...parentAttributes,
      color: {
        ...parentAttributes.color,
        validate: validateHighlightColor,
      },
    }
  },
})

export const highlightFeature = defineRichTextFeature({
  key: 'highlight',
  editorImplementation: true,
  serverImplementation: true,
  documentExtensions: () => [
    RichTextHighlight.configure({
      multicolor: true,
    }),
  ],
})
