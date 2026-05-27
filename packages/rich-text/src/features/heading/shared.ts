import Heading from '@tiptap/extension-heading'
import { defineRichTextFeature } from '../../core/feature'

export const headingFeature = defineRichTextFeature({
  key: 'heading',
  extension: () => Heading.configure({ levels: [1, 2, 3] }),
})
