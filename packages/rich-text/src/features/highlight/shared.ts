import type { Attributes } from '@tiptap/core'
import { Highlight } from '@tiptap/extension-highlight'
import { defineRichTextFeature } from '../../core/feature'
import { normalizeHighlightColor } from './colors'

function validateHighlightColor(value: unknown) {
  if (value !== null && normalizeHighlightColor(value) !== value) {
    throw new RangeError('Unsupported highlight color')
  }
}

function getInlineStyleValue(style: string | null, property: string) {
  let value: string | null = null

  for (const declaration of style?.split(';') ?? []) {
    const separator = declaration.indexOf(':')

    if (separator === -1 || declaration.slice(0, separator).trim().toLowerCase() !== property) {
      continue
    }

    value = declaration.slice(separator + 1)
  }

  return value
}

function parseHighlightColor(element: HTMLElement) {
  if (element.hasAttribute('data-color')) {
    return normalizeHighlightColor(element.getAttribute('data-color'))
  }

  return normalizeHighlightColor(
    getInlineStyleValue(element.getAttribute('style'), 'background-color'),
  )
}

const RichTextHighlight = Highlight.extend({
  addAttributes() {
    const parentAttributes: Attributes = this.parent?.() ?? {}

    return {
      ...parentAttributes,
      color: {
        ...parentAttributes.color,
        parseHTML: parseHighlightColor,
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
