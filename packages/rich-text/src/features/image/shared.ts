import { mergeAttributes } from '@tiptap/core'
import Image from '@tiptap/extension-image'
import { defineRichTextFeature } from '../../core/feature'
import { buildImageStyle, normalizeImageDimension, normalizeImageSize } from './dimensions'

function validateImageDimension(value: unknown) {
  if (value !== null && (typeof value !== 'number' || !Number.isInteger(value) || value <= 0)) {
    throw new RangeError('Invalid image dimension')
  }
}

const RichTextImage = Image.extend({
  addAttributes() {
    return {
      src: {
        isRequired: true,
        validate: 'string',
      },
      alt: {
        default: null,
        validate: 'string|null',
      },
      width: {
        default: null,
        validate: validateImageDimension,
        parseHTML: (element) => normalizeImageDimension(element.getAttribute('width')),
      },
      height: {
        default: null,
        validate: validateImageDimension,
        parseHTML: (element) => normalizeImageDimension(element.getAttribute('height')),
      },
    }
  },
  renderHTML({ HTMLAttributes }) {
    const { width, height } = normalizeImageSize(HTMLAttributes)

    return [
      'img',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        width,
        height,
        style: buildImageStyle(width),
      }),
    ]
  },
})

export const imageFeature = defineRichTextFeature({
  key: 'image',
  editorImplementation: true,
  serverImplementation: true,
  documentExtensions: () => [RichTextImage],
})
