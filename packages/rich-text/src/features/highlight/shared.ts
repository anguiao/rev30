import type { Attributes } from '@tiptap/core'
import { Highlight } from '@tiptap/extension-highlight'
import { defineRichTextFeature } from '../../core/feature'
import { normalizeHighlightColor } from './colors'

function validateHighlightColor(value: unknown) {
  if (value !== null && normalizeHighlightColor(value) !== value) {
    throw new RangeError('Unsupported highlight color')
  }
}

const RichTextHighlight = Highlight.extend({
  addAttributes() {
    const parentAttributes: Attributes = this.parent?.() ?? {}
    const parentColor = parentAttributes.color

    return {
      ...parentAttributes,
      color: {
        ...parentColor,
        parseHTML: (element) =>
          normalizeHighlightColor(
            element.hasAttribute('data-color')
              ? element.getAttribute('data-color')
              : parentColor?.parseHTML?.(element),
          ),
        validate: validateHighlightColor,
      },
    }
  },
})

export const highlightFeature = defineRichTextFeature({
  key: 'highlight',
  editorImplementation: true,
  serverImplementation: true,
  sharedExtensions: () => [
    RichTextHighlight.configure({
      multicolor: true,
    }),
  ],
})
