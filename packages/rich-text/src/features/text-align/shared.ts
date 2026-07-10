import TextAlign from '@tiptap/extension-text-align'
import { defineRichTextFeature } from '../../core/feature'
import { textAlignments } from './alignments'

const textAlignTypes = ['heading', 'paragraph']
const textAlignmentSet = new Set<unknown>(textAlignments)

function validateTextAlignment(value: unknown) {
  if (value !== null && !textAlignmentSet.has(value)) {
    throw new RangeError('Unsupported text alignment')
  }
}

const RichTextTextAlign = TextAlign.extend({
  addGlobalAttributes() {
    return (this.parent?.() ?? []).map((attributeGroup) => ({
      ...attributeGroup,
      attributes: {
        ...attributeGroup.attributes,
        textAlign: {
          ...attributeGroup.attributes.textAlign,
          validate: validateTextAlignment,
        },
      },
    }))
  },
})

export const textAlignFeature = defineRichTextFeature({
  key: 'text-align',
  extension: () =>
    RichTextTextAlign.configure({
      types: textAlignTypes,
      alignments: [...textAlignments],
      defaultAlignment: null,
    }),
})
