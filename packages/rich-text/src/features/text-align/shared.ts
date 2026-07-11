import TextAlign from '@tiptap/extension-text-align'
import { defineRichTextFeature } from '../../core/feature'
import { baseFeature } from '../base/shared'
import { headingFeature } from '../heading/shared'
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
  dependencies: [baseFeature, headingFeature],
  documentExtensions: () => [
    RichTextTextAlign.configure({
      types: textAlignTypes,
      alignments: [...textAlignments],
      defaultAlignment: null,
    }),
  ],
})
