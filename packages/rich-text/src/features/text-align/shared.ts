import TextAlign from '@tiptap/extension-text-align'
import { defineRichTextFeature } from '../../core/feature'
import { textAlignments } from './alignments'

const textAlignTypes = ['heading', 'paragraph']
const textAlignmentSet = new Set<string>(textAlignments)

function validateTextAlignment(value: unknown) {
  if (value !== null && (typeof value !== 'string' || !textAlignmentSet.has(value))) {
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
  editorImplementation: true,
  serverImplementation: true,
  documentExtensions: () => [
    RichTextTextAlign.configure({
      types: textAlignTypes,
      alignments: [...textAlignments],
      defaultAlignment: null,
    }),
  ],
})
