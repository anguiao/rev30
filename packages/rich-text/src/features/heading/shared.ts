import type { Attributes } from '@tiptap/core'
import Heading from '@tiptap/extension-heading'
import { defineRichTextFeature } from '../../core/feature'

const headingLevels = [1, 2, 3] as const
const headingLevelSet = new Set<unknown>(headingLevels)

function validateHeadingLevel(value: unknown) {
  if (!headingLevelSet.has(value)) {
    throw new RangeError('Unsupported heading level')
  }
}

const RichTextHeading = Heading.extend({
  addAttributes() {
    const parentAttributes: Attributes = this.parent?.() ?? {}

    return {
      ...parentAttributes,
      level: {
        ...parentAttributes.level,
        validate: validateHeadingLevel,
      },
    }
  },
})

export const headingFeature = defineRichTextFeature({
  key: 'heading',
  extension: () => RichTextHeading.configure({ levels: [...headingLevels] }),
})
