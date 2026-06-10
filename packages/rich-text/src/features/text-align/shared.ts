import TextAlign from '@tiptap/extension-text-align'
import { defineRichTextFeature } from '../../core/feature'
import { textAlignments } from './alignments'

const textAlignTypes = ['heading', 'paragraph']

export const textAlignFeature = defineRichTextFeature({
  key: 'text-align',
  extension: () =>
    TextAlign.configure({
      types: textAlignTypes,
      alignments: [...textAlignments],
      defaultAlignment: null,
    }),
})
