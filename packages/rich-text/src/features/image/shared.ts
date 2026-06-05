import { mergeAttributes } from '@tiptap/core'
import Image from '@tiptap/extension-image'
import { defineRichTextFeature } from '../../core/feature'
import { buildImageStyle, normalizeImageDimension, normalizeImageSize } from './dimensions'

export interface RichTextImageAttrs {
  src: string
  alt?: string
  width?: number
  height?: number
}

export const imageFeature = defineRichTextFeature({
  key: 'image',
  extension: () =>
    Image.extend({
      addAttributes() {
        const parentAttributes = { ...this.parent?.() }
        delete parentAttributes.title

        return {
          ...parentAttributes,
          width: {
            default: null,
            parseHTML: (element) => normalizeImageDimension(element.getAttribute('width')),
            renderHTML: (attributes) => {
              const { width } = normalizeImageSize(attributes)
              return width === null ? {} : { width }
            },
          },
          height: {
            default: null,
            parseHTML: (element) => normalizeImageDimension(element.getAttribute('height')),
            renderHTML: (attributes) => {
              const { height } = normalizeImageSize(attributes)
              return height === null ? {} : { height }
            },
          },
        }
      },
      renderHTML({ HTMLAttributes }) {
        const { width, height } = normalizeImageSize(HTMLAttributes)

        return [
          'img',
          mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
            ...(width === null ? { width: null } : { width }),
            ...(height === null ? { height: null } : { height }),
            style: buildImageStyle(width),
          }),
        ]
      },
    }),
})
