import { UndoRedo } from '@tiptap/extensions'
import { defineRichTextFeature } from '../../core/feature'

export const historyFeature = defineRichTextFeature({
  key: 'history',
  extension: () => UndoRedo,
})
