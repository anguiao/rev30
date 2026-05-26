import { UndoRedo } from '@tiptap/extensions'
import { defineRichTextFeature } from '../../core/feature'

export const historyFeature = defineRichTextFeature({
  key: 'history',
  label: '历史',
  icon: 'i-[lucide--undo-2]',
  extension: () => UndoRedo,
})
