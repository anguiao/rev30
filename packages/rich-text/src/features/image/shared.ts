import { mergeAttributes } from '@tiptap/core'
import Image from '@tiptap/extension-image'
import { defineRichTextFeature } from '../../core/feature'

export interface RichTextImageAttrs {
  src: string
  alt?: string
  width?: number
  height?: number
}

function normalizeDimension(value: unknown) {
  const numberValue = typeof value === 'number' ? value : Number(value)

  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null
}

function imageStyle(width: number | null) {
  return width === null
    ? 'max-width: 100%; height: auto'
    : `width: ${width}px; max-width: 100%; height: auto`
}

function normalizeImageDimensions(attributes: Record<string, unknown>) {
  const width = normalizeDimension(attributes.width)
  const height = width === null ? null : normalizeDimension(attributes.height)

  return { width, height }
}

export const imageFeature = defineRichTextFeature({
  key: 'image',
  extension: () =>
    Image.extend({
      addAttributes() {
        const parentAttributes = { ...this.parent?.() }
        delete (parentAttributes as Record<string, unknown>).title

        return {
          ...parentAttributes,
          width: {
            default: null,
            parseHTML: (element) => normalizeDimension(element.getAttribute('width')),
            renderHTML: (attributes) => {
              const width = normalizeDimension(attributes.width)
              return width === null ? {} : { width }
            },
          },
          height: {
            default: null,
            parseHTML: (element) => normalizeDimension(element.getAttribute('height')),
            renderHTML: (attributes) => {
              const { height } = normalizeImageDimensions(attributes as Record<string, unknown>)
              return height === null ? {} : { height }
            },
          },
        }
      },
      renderHTML({ HTMLAttributes }) {
        const { width, height } = normalizeImageDimensions(HTMLAttributes)

        return [
          'img',
          mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
            ...(width === null ? { width: null } : { width }),
            ...(height === null ? { height: null } : { height }),
            style: imageStyle(width),
          }),
        ]
      },
    }),
})
